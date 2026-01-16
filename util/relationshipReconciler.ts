import { App, TFile } from "obsidian";
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

