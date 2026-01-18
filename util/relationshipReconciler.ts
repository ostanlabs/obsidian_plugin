import { App, TFile, Notice } from "obsidian";
import { parseAnyFrontmatter, updateFrontmatter } from "./frontmatter";

/**
 * Relationship pairs that should be bidirectional
 * Format: [forwardField, inverseField]
 */
const RELATIONSHIP_PAIRS: [string, string][] = [
	["implements", "implemented_by"],
	["implemented_by", "implements"],
	["depends_on", "blocks"],
	["blocks", "depends_on"],
	["enables", "enabled_by"],
	["enabled_by", "enables"],
	["parent", "children"],
	["children", "parent"],
];

/**
 * Relationship fields that create ordering constraints (A must come before B)
 * Format: [field, direction] where direction indicates if the source is "before" or "after" the target
 * - "before": source -> target means source must be LEFT of target (source blocks target, or target depends_on source)
 * - "after": source -> target means source must be RIGHT of target (source depends_on target)
 */
const ORDERING_RELATIONSHIPS: { field: string; direction: "before" | "after" }[] = [
	{ field: "depends_on", direction: "after" },  // A depends_on B means A is AFTER B (B -> A)
	{ field: "blocks", direction: "before" },     // A blocks B means A is BEFORE B (A -> B)
];

export interface ReconciliationResult {
	totalReconciled: number;
	details: {
		entityId: string;
		field: string;
		addedValues: string[];
	}[];
}

/**
 * Reconcile bidirectional relationships across all entity files
 * For each relationship pair (e.g., implements/implemented_by), ensures both sides are consistent
 */
export async function reconcileRelationships(
	app: App,
	entityFiles: TFile[]
): Promise<ReconciliationResult> {
	const result: ReconciliationResult = {
		totalReconciled: 0,
		details: [],
	};

	// Build entity map: entityId -> { file, frontmatter }
	const entityMap = new Map<string, { file: TFile; frontmatter: Record<string, unknown> }>();

	for (const file of entityFiles) {
		try {
			const content = await app.vault.read(file);
			const frontmatter = parseAnyFrontmatter(content);
			if (frontmatter && frontmatter.id) {
				entityMap.set(frontmatter.id as string, { file, frontmatter });
			}
		} catch (e) {
			console.warn(`Failed to read frontmatter for ${file.path}:`, e);
		}
	}

	console.log(`[Reconciler] Built entity map with ${entityMap.size} entities`);

	// Track updates to apply: entityId -> { field -> values to add }
	const pendingUpdates = new Map<string, Map<string, Set<string>>>();

	// For each entity, check all relationship pairs
	for (const [entityId, { frontmatter }] of entityMap) {
		for (const [forwardField, inverseField] of RELATIONSHIP_PAIRS) {
			const forwardValues = getArrayField(frontmatter, forwardField);
			
			for (const targetId of forwardValues) {
				const target = entityMap.get(targetId);
				if (!target) continue; // Target not in vault

				const targetInverseValues = getArrayField(target.frontmatter, inverseField);
				
				// Check if inverse relationship exists
				if (!targetInverseValues.includes(entityId)) {
					// Need to add entityId to target's inverseField
					if (!pendingUpdates.has(targetId)) {
						pendingUpdates.set(targetId, new Map());
					}
					const targetUpdates = pendingUpdates.get(targetId)!;
					if (!targetUpdates.has(inverseField)) {
						targetUpdates.set(inverseField, new Set());
					}
					targetUpdates.get(inverseField)!.add(entityId);
				}
			}
		}
	}

	// Apply updates
	for (const [entityId, fieldUpdates] of pendingUpdates) {
		const entity = entityMap.get(entityId);
		if (!entity) continue;

		const { file, frontmatter } = entity;
		const updates: Record<string, unknown> = {};
		
		for (const [field, valuesToAdd] of fieldUpdates) {
			const existingValues = getArrayField(frontmatter, field);
			const newValues = [...new Set([...existingValues, ...valuesToAdd])];
			updates[field] = newValues;
			
			result.details.push({
				entityId,
				field,
				addedValues: [...valuesToAdd],
			});
			result.totalReconciled += valuesToAdd.size;
		}

		// Update the file
		try {
			const content = await app.vault.read(file);
			const updatedContent = updateFrontmatter(content, updates);
			await app.vault.modify(file, updatedContent);
			console.log(`[Reconciler] Updated ${entityId}: ${JSON.stringify(updates)}`);
		} catch (e) {
			console.error(`[Reconciler] Failed to update ${file.path}:`, e);
		}
	}

	return result;
}

/**
 * Get array field from frontmatter, handling various formats
 */
function getArrayField(frontmatter: Record<string, unknown>, field: string): string[] {
	const value = frontmatter[field];
	if (!value) return [];
	if (Array.isArray(value)) return value.map(v => String(v));
	if (typeof value === "string") return [value];
	return [];
}

export interface TransitiveCleanupResult {
	totalCleaned: number;
	details: {
		entityId: string;
		field: string;
		removedItems: string[];
	}[];
}

// Mapping of fields to their reverse fields
// When we remove X from entity.children, we also need to remove entity from X.parent
const REVERSE_FIELD_MAP: Record<string, { field: string; isArray: boolean }> = {
	"children": { field: "parent", isArray: false },
	"depends_on": { field: "blocks", isArray: true },
	"implemented_by": { field: "implements", isArray: true },
	"enables": { field: "enabled_by", isArray: true },
};

/**
 * Clean up transitively implied relationships for ALL edge-creating fields.
 *
 * For depends_on:
 *   If C depends on [A, B] and B depends on A, then A is transitively implied by B.
 *   We can remove A from C's depends_on since completing B implies A is complete.
 *
 * For children:
 *   If parent P has children [A, B, C] and C depends on B depends on A,
 *   then A and B are transitively implied by C. We keep only C as a child.
 *   This means only the "leaf" children (those not depended on by other children) remain.
 *
 * For implemented_by:
 *   If feature F is implemented_by [M1, M2, M3] and M3 depends on M2 depends on M1,
 *   then M1 and M2 are transitively implied. We keep only M3.
 *
 * The general rule: if item X is in a list, and another item Y in the same list
 * transitively depends on X (via depends_on chain), then X is redundant.
 *
 * IMPORTANT: This also updates the reverse side of the relationship.
 * E.g., if we remove T-105 from S-058.children, we also remove S-058 from T-105.parent.
 */
export async function cleanTransitiveDependencies(
	app: App,
	entityFiles: TFile[]
): Promise<TransitiveCleanupResult> {
	const result: TransitiveCleanupResult = {
		totalCleaned: 0,
		details: [],
	};

	// Fields that create edges and should have transitive cleanup applied
	const edgeCreatingFields = [
		"depends_on",
		"children",
		"implemented_by",
		"enables",
	];

	// Build entity map: entityId -> { file, frontmatter, dependsOn, children, etc. }
	const entityMap = new Map<string, {
		file: TFile;
		frontmatter: Record<string, unknown>;
		dependsOn: string[];
	}>();

	for (const file of entityFiles) {
		try {
			const content = await app.vault.read(file);
			const frontmatter = parseAnyFrontmatter(content);
			if (frontmatter && frontmatter.id) {
				const dependsOn = getArrayField(frontmatter, "depends_on");
				entityMap.set(frontmatter.id as string, { file, frontmatter, dependsOn });
			}
		} catch (e) {
			console.warn(`[TransitiveCleanup] Failed to read frontmatter for ${file.path}:`, e);
		}
	}

	console.log(`[TransitiveCleanup] Built entity map with ${entityMap.size} entities`);

	// Build dependents map: entityId -> Set of entities that depend on it
	// This is the reverse of depends_on - used to check if an entity has dependents
	const dependentsMap = new Map<string, Set<string>>();
	for (const [entityId, { dependsOn }] of entityMap) {
		for (const depId of dependsOn) {
			if (!dependentsMap.has(depId)) {
				dependentsMap.set(depId, new Set());
			}
			dependentsMap.get(depId)!.add(entityId);
		}
	}

	/**
	 * Check if an entity has any dependents (something depends on it)
	 */
	function hasDependents(entityId: string): boolean {
		const deps = dependentsMap.get(entityId);
		return deps !== undefined && deps.size > 0;
	}

	// Build transitive dependency cache: entityId -> Set of all transitive dependencies
	const transitiveCache = new Map<string, Set<string>>();

	/**
	 * Get all transitive dependencies for an entity (recursive with memoization)
	 * This follows the depends_on chain to find all entities that must be completed
	 * before this entity can be completed.
	 */
	function getTransitiveDeps(entityId: string, visited: Set<string> = new Set()): Set<string> {
		// Check cache
		if (transitiveCache.has(entityId)) {
			return transitiveCache.get(entityId)!;
		}

		// Prevent cycles
		if (visited.has(entityId)) {
			return new Set();
		}
		visited.add(entityId);

		const entity = entityMap.get(entityId);
		if (!entity) {
			return new Set();
		}

		const transitive = new Set<string>();

		// Add direct dependencies
		for (const depId of entity.dependsOn) {
			transitive.add(depId);
			// Add transitive dependencies of each direct dependency
			const subTransitive = getTransitiveDeps(depId, new Set(visited));
			for (const subDep of subTransitive) {
				transitive.add(subDep);
			}
		}

		transitiveCache.set(entityId, transitive);
		return transitive;
	}

	// Track reverse updates: entityId -> { field -> newValue }
	// We collect all reverse updates first, then apply them at the end
	const reverseUpdates = new Map<string, Record<string, string | string[] | null>>();

	// Process each entity
	for (const [entityId, { file, frontmatter }] of entityMap) {
		const updates: Record<string, string[]> = {};

		// Process each edge-creating field
		for (const field of edgeCreatingFields) {
			const items = getArrayField(frontmatter, field);
			if (items.length <= 1) {
				// Nothing to clean if 0 or 1 items
				continue;
			}

			// For each item, check if it's transitively implied by another item
			const itemsToRemove = new Set<string>();

			// Debug: log transitive deps for each item
			console.log(`[TransitiveCleanup] ${entityId}.${field} items: ${items.join(", ")}`);
			for (const item of items) {
				const transitiveDeps = getTransitiveDeps(item);
				console.log(`[TransitiveCleanup]   ${item} transitive deps: ${Array.from(transitiveDeps).join(", ") || "(none)"}`);
			}

			for (const itemA of items) {
				// Check if any OTHER item in the list transitively depends on itemA
				for (const itemB of items) {
					if (itemA === itemB) continue;

					const itemBTransitive = getTransitiveDeps(itemB);
					if (itemBTransitive.has(itemA)) {
						// itemB transitively depends on itemA, so itemA is redundant

						// Special case for "children" field: only remove if itemA has dependents
						// If itemA has no dependents, removing it from children would orphan it
						// (it would have no parent and nothing depending on it to position it)
						if (field === "children" && !hasDependents(itemA)) {
							console.log(`[TransitiveCleanup]   -> ${itemA} is transitively implied but has NO dependents, keeping to avoid orphaning`);
							continue;
						}

						console.log(`[TransitiveCleanup]   -> ${itemA} is redundant (${itemB} transitively depends on it)`);
						itemsToRemove.add(itemA);
						break; // No need to check other items
					}
				}
			}

			if (itemsToRemove.size > 0) {
				const cleanedItems = items.filter(d => !itemsToRemove.has(d));
				updates[field] = cleanedItems;

				console.log(`[TransitiveCleanup] ${entityId}.${field}: removing ${Array.from(itemsToRemove).join(", ")} (kept: ${cleanedItems.join(", ")})`);

				result.details.push({
					entityId,
					field,
					removedItems: Array.from(itemsToRemove),
				});
				result.totalCleaned += itemsToRemove.size;

				// Schedule reverse updates for removed items
				// When removing from children, also clear the parent field on the child
				// The child won't be orphaned because hasDependents() check ensures it has dependents
				const reverseInfo = REVERSE_FIELD_MAP[field];
				if (reverseInfo) {
					for (const removedItemId of itemsToRemove) {
						const removedEntity = entityMap.get(removedItemId);
						if (!removedEntity) continue;

						if (!reverseUpdates.has(removedItemId)) {
							reverseUpdates.set(removedItemId, {});
						}
						const entityReverseUpdates = reverseUpdates.get(removedItemId)!;

						if (reverseInfo.isArray) {
							// Remove entityId from the array field
							const currentArray = getArrayField(removedEntity.frontmatter, reverseInfo.field);
							const newArray = currentArray.filter(id => id !== entityId);
							entityReverseUpdates[reverseInfo.field] = newArray;
							console.log(`[TransitiveCleanup] ${removedItemId}.${reverseInfo.field}: removing ${entityId}`);
						} else {
							// Clear the scalar field if it matches entityId
							const currentValue = removedEntity.frontmatter[reverseInfo.field] as string | undefined;
							if (currentValue === entityId) {
								entityReverseUpdates[reverseInfo.field] = null;
								console.log(`[TransitiveCleanup] ${removedItemId}.${reverseInfo.field}: clearing (was ${entityId})`);
							}
						}
					}
				}
			}
		}

		// Update the file if there are changes
		if (Object.keys(updates).length > 0) {
			try {
				const content = await app.vault.read(file);
				const updatedContent = updateFrontmatter(content, updates);
				await app.vault.modify(file, updatedContent);
			} catch (e) {
				console.error(`[TransitiveCleanup] Failed to update ${file.path}:`, e);
			}
		}
	}

	// Apply reverse updates
	for (const [entityId, updates] of reverseUpdates) {
		const entity = entityMap.get(entityId);
		if (!entity) continue;

		// Convert null values to empty string for frontmatter update (to remove the field)
		const frontmatterUpdates: Record<string, unknown> = {};
		for (const [field, value] of Object.entries(updates)) {
			if (value === null) {
				frontmatterUpdates[field] = "";  // Empty string removes the field
			} else {
				frontmatterUpdates[field] = value;
			}
		}

		if (Object.keys(frontmatterUpdates).length > 0) {
			try {
				const content = await app.vault.read(entity.file);
				const updatedContent = updateFrontmatter(content, frontmatterUpdates);
				await app.vault.modify(entity.file, updatedContent);
			} catch (e) {
				console.error(`[TransitiveCleanup] Failed to update reverse relationships for ${entity.file.path}:`, e);
			}
		}
	}

	return result;
}

export interface CycleBreakResult {
	cyclesFound: number;
	edgesRemoved: {
		fromEntity: string;
		toEntity: string;
		field: string;
		cycle: string[];
	}[];
}

/**
 * Detect and break cycles in milestone dependency/blocks relationships.
 *
 * A cycle occurs when following depends_on/blocks relationships leads back to the starting node.
 * For example: M-001 blocks M-026, M-026 depends_on M-001 is NOT a cycle (it's bidirectional).
 * But: M-001 -> M-002 -> M-003 -> M-001 IS a cycle.
 *
 * When a cycle is detected, we break it by removing the "back edge" - the edge that completes the cycle.
 * We remove from the entity that has the most outgoing edges in the cycle (to minimize disruption).
 *
 * @param app Obsidian App instance
 * @param entityFiles Array of entity files to check (typically milestones)
 * @param entityTypeFilter Optional filter to only check certain entity types (e.g., "milestone")
 */
export async function detectAndBreakCycles(
	app: App,
	entityFiles: TFile[],
	entityTypeFilter?: string
): Promise<CycleBreakResult> {
	const result: CycleBreakResult = {
		cyclesFound: 0,
		edgesRemoved: [],
	};

	// Build entity map: entityId -> { file, frontmatter, type }
	const entityMap = new Map<string, {
		file: TFile;
		frontmatter: Record<string, unknown>;
		type: string;
	}>();

	for (const file of entityFiles) {
		try {
			const content = await app.vault.read(file);
			const frontmatter = parseAnyFrontmatter(content);
			if (frontmatter && frontmatter.id) {
				const entityType = (frontmatter.type as string || "").toLowerCase();
				if (!entityTypeFilter || entityType === entityTypeFilter.toLowerCase()) {
					entityMap.set(frontmatter.id as string, {
						file,
						frontmatter,
						type: entityType,
					});
				}
			}
		} catch (e) {
			console.warn(`[CycleBreaker] Failed to read frontmatter for ${file.path}:`, e);
		}
	}

	console.log(`[CycleBreaker] Built entity map with ${entityMap.size} entities${entityTypeFilter ? ` (filtered to ${entityTypeFilter})` : ""}`);

	// Build directed graph: entityId -> Set of entityIds it points to (must come AFTER)
	// Edge A -> B means A must be positioned BEFORE B
	const graph = new Map<string, Set<string>>();
	// Track which field created each edge for removal
	const edgeSource = new Map<string, { field: string; fromEntity: string }>();

	for (const [entityId, { frontmatter }] of entityMap) {
		if (!graph.has(entityId)) {
			graph.set(entityId, new Set());
		}

		for (const rel of ORDERING_RELATIONSHIPS) {
			const targets = getArrayField(frontmatter, rel.field);
			for (const targetId of targets) {
				if (!entityMap.has(targetId)) continue; // Target not in our set

				if (rel.direction === "before") {
					// A blocks B: A -> B (A must be before B)
					graph.get(entityId)!.add(targetId);
					edgeSource.set(`${entityId}->${targetId}`, { field: rel.field, fromEntity: entityId });
				} else {
					// A depends_on B: B -> A (B must be before A)
					if (!graph.has(targetId)) {
						graph.set(targetId, new Set());
					}
					graph.get(targetId)!.add(entityId);
					edgeSource.set(`${targetId}->${entityId}`, { field: rel.field, fromEntity: entityId });
				}
			}
		}
	}

	console.log(`[CycleBreaker] Built graph with ${graph.size} nodes`);

	// Log all edges for debugging
	let edgeCount = 0;
	for (const [from, tos] of graph) {
		for (const to of tos) {
			console.log(`[CycleBreaker] Edge: ${from} -> ${to}`);
			edgeCount++;
		}
	}
	console.log(`[CycleBreaker] Total edges: ${edgeCount}`);

	// Find all cycles using DFS
	const allCycles: string[][] = [];
	const globalVisited = new Set<string>();

	function findCycles(start: string): void {
		const path: string[] = [];
		const pathSet = new Set<string>();
		const localVisited = new Set<string>();

		function dfs(node: string): void {
			if (pathSet.has(node)) {
				// Found a cycle! Extract it
				const cycleStart = path.indexOf(node);
				const cycle = path.slice(cycleStart);
				cycle.push(node); // Complete the cycle
				allCycles.push(cycle);
				return;
			}

			if (localVisited.has(node)) return;
			localVisited.add(node);

			path.push(node);
			pathSet.add(node);

			const neighbors = graph.get(node) || new Set();
			for (const neighbor of neighbors) {
				dfs(neighbor);
			}

			path.pop();
			pathSet.delete(node);
		}

		dfs(start);
		globalVisited.add(start);
	}

	// Run DFS from each unvisited node
	for (const entityId of graph.keys()) {
		if (!globalVisited.has(entityId)) {
			findCycles(entityId);
		}
	}

	console.log(`[CycleBreaker] Found ${allCycles.length} cycles`);

	if (allCycles.length === 0) {
		return result;
	}

	// Deduplicate cycles (same cycle can be found starting from different nodes)
	const uniqueCycles: string[][] = [];
	const cycleSignatures = new Set<string>();

	for (const cycle of allCycles) {
		// Normalize cycle: rotate to start with smallest ID, then create signature
		const minIdx = cycle.slice(0, -1).reduce((minI, id, i, arr) => id < arr[minI] ? i : minI, 0);
		const normalized = [...cycle.slice(minIdx, -1), ...cycle.slice(0, minIdx), cycle[minIdx]];
		const signature = normalized.join("->");

		if (!cycleSignatures.has(signature)) {
			cycleSignatures.add(signature);
			uniqueCycles.push(cycle);
		}
	}

	console.log(`[CycleBreaker] ${uniqueCycles.length} unique cycles after deduplication`);
	result.cyclesFound = uniqueCycles.length;

	// Break each cycle by removing one edge
	const edgesToRemove: { fromEntity: string; toEntity: string; field: string; sourceEntity: string; cycle: string[] }[] = [];

	for (const cycle of uniqueCycles) {
		console.log(`[CycleBreaker] Cycle: ${cycle.join(" -> ")}`);

		// Find the best edge to remove:
		// Prefer removing from the entity with the most outgoing edges (least critical single edge)
		let bestEdge: { from: string; to: string; score: number } | null = null;

		for (let i = 0; i < cycle.length - 1; i++) {
			const from = cycle[i];
			const to = cycle[i + 1];
			const outDegree = graph.get(from)?.size || 0;

			if (!bestEdge || outDegree > bestEdge.score) {
				bestEdge = { from, to, score: outDegree };
			}
		}

		if (bestEdge) {
			const edgeKey = `${bestEdge.from}->${bestEdge.to}`;
			const source = edgeSource.get(edgeKey);

			if (source) {
				edgesToRemove.push({
					fromEntity: bestEdge.from,
					toEntity: bestEdge.to,
					field: source.field,
					sourceEntity: source.fromEntity,
					cycle,
				});

				// Remove from graph to prevent processing same edge multiple times
				graph.get(bestEdge.from)?.delete(bestEdge.to);
			}
		}
	}

	// Apply removals to MD files
	// Group by source entity to batch updates
	const updatesByEntity = new Map<string, { file: TFile; frontmatter: Record<string, unknown>; removals: { field: string; valueToRemove: string }[] }>();

	for (const edge of edgesToRemove) {
		const entity = entityMap.get(edge.sourceEntity);
		if (!entity) continue;

		if (!updatesByEntity.has(edge.sourceEntity)) {
			updatesByEntity.set(edge.sourceEntity, {
				file: entity.file,
				frontmatter: entity.frontmatter,
				removals: [],
			});
		}

		// Determine what value to remove based on the field and edge direction
		let valueToRemove: string;
		if (edge.field === "blocks" && edge.sourceEntity === edge.fromEntity) {
			// A blocks B, edge is A->B, remove B from A's blocks
			valueToRemove = edge.toEntity;
		} else if (edge.field === "depends_on" && edge.sourceEntity === edge.toEntity) {
			// A depends_on B, edge is B->A, remove B from A's depends_on
			valueToRemove = edge.fromEntity;
		} else {
			console.warn(`[CycleBreaker] Unexpected edge configuration: ${JSON.stringify(edge)}`);
			continue;
		}

		updatesByEntity.get(edge.sourceEntity)!.removals.push({
			field: edge.field,
			valueToRemove,
		});

		result.edgesRemoved.push({
			fromEntity: edge.fromEntity,
			toEntity: edge.toEntity,
			field: edge.field,
			cycle: edge.cycle,
		});
	}

	// Apply updates
	for (const [entityId, { file, frontmatter, removals }] of updatesByEntity) {
		const updates: Record<string, unknown> = {};

		for (const { field, valueToRemove } of removals) {
			const currentValues = getArrayField(frontmatter, field);
			const newValues = currentValues.filter(v => v !== valueToRemove);

			if (newValues.length !== currentValues.length) {
				updates[field] = newValues;
				console.log(`[CycleBreaker] ${entityId}: removing "${valueToRemove}" from ${field}`);
			}
		}

		if (Object.keys(updates).length > 0) {
			try {
				const content = await app.vault.read(file);
				const updatedContent = updateFrontmatter(content, updates);
				await app.vault.modify(file, updatedContent);
				console.log(`[CycleBreaker] Updated ${file.path}`);
			} catch (e) {
				console.error(`[CycleBreaker] Failed to update ${file.path}:`, e);
			}
		}
	}

	if (result.edgesRemoved.length > 0) {
		// Build detailed message about what was removed
		const removedDetails = result.edgesRemoved.map(e => {
			if (e.field === "blocks") {
				return `${e.fromEntity} no longer blocks ${e.toEntity}`;
			} else {
				return `${e.toEntity} no longer depends_on ${e.fromEntity}`;
			}
		}).join("\n• ");

		new Notice(`🔄 Broke ${result.cyclesFound} cycle(s):\n• ${removedDetails}`, 10000);
	}

	return result;
}
