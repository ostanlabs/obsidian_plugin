/**
 * Canvas Node Positioning Algorithm V3
 * 
 * Hierarchical container-based layout with workstream lanes.
 * Children positioned LEFT and ABOVE their parents.
 * Milestones sorted by dependency/blocks relationships within workstreams.
 */

import { App, TFile, Notice } from 'obsidian';
import { CanvasNode, CanvasData, CanvasEdge } from './canvas';

// ============================================================================
// Types
// ============================================================================

export type EntityType = 'milestone' | 'story' | 'task' | 'decision' | 'document' | 'feature';

export interface PositioningConfig {
	nodeSizes: Record<EntityType, { width: number; height: number }>;
	childGap: number;           // Gap between child nodes in grid
	containerGap: number;       // Gap between milestone containers
	workstreamGap: number;      // Gap between workstream rows
	orphanGap: number;          // Gap between orphan area and workstreams
	crossWorkstreamBandMinHeight: number;
}

export const DEFAULT_POSITIONING_CONFIG: PositioningConfig = {
	nodeSizes: {
		milestone: { width: 400, height: 200 },
		story: { width: 400, height: 200 },
		task: { width: 400, height: 200 },
		decision: { width: 400, height: 200 },
		document: { width: 400, height: 200 },
		feature: { width: 400, height: 200 },
	},
	childGap: 90,
	containerGap: 130,
	workstreamGap: 170,
	orphanGap: 150,
	crossWorkstreamBandMinHeight: 110,
};

/** Parsed entity data from frontmatter */
export interface EntityData {
	entityId: string;
	nodeId: string;
	type: EntityType;
	workstream: string;
	parent?: string;
	dependsOn: string[];
	blocks: string[];
	enables: string[];
	implementedBy: string[];
	implements: string[];
	filePath: string;
}

/** Container size after recursive calculation */
export interface ContainerSize {
	width: number;
	height: number;
	gridColumns: number;
	gridRows: number;
}

/** Final position for a node */
export interface NodePosition {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Internal node representation during processing */
interface ProcessedNode {
	entityId: string;
	nodeId: string;
	type: EntityType;
	workstream: string;
	data: EntityData;
	children: ProcessedNode[];
	containerSize?: ContainerSize;
	position?: NodePosition;
	relativeOffset?: { x: number; y: number };
}

/** Workstream with its milestones */
interface WorkstreamData {
	name: string;
	milestones: ProcessedNode[];
	baseY: number;
	height: number;
}

/** Multi-parent entity waiting for positioning */
interface MultiParentEntity {
	node: ProcessedNode;
	parentEntityIds: string[];
	parentWorkstreams: Set<string>;
}

/** Cross-workstream band for multi-parent entities */
interface CrossWorkstreamBand {
	workstreams: [string, string];
	entities: MultiParentEntity[];
	yPosition: number;
	height: number;
}

/** Result of the positioning algorithm */
export interface PositioningResult {
	positions: Map<string, NodePosition>;  // nodeId -> position
	errors: string[];
	warnings: string[];
}

// ============================================================================
// Main Positioning Class
// ============================================================================

export class PositioningEngineV3 {
	private config: PositioningConfig;
	private entityMap: Map<string, EntityData> = new Map();  // entityId -> data
	private nodeIdToEntityId: Map<string, string> = new Map();  // nodeId -> entityId
	private entityIdToNodeId: Map<string, string> = new Map();  // entityId -> nodeId
	private processedNodes: Map<string, ProcessedNode> = new Map();  // entityId -> node
	private workstreams: Map<string, WorkstreamData> = new Map();
	private multiParentEntities: MultiParentEntity[] = [];
	private orphanedEntities: ProcessedNode[] = [];
	private crossWorkstreamBands: CrossWorkstreamBand[] = [];
	private errors: string[] = [];
	private warnings: string[] = [];

	constructor(config: Partial<PositioningConfig> = {}) {
		this.config = { ...DEFAULT_POSITIONING_CONFIG, ...config };
	}

	/**
	 * Main entry point: calculate positions for all nodes
	 */
	public calculatePositions(entities: EntityData[]): PositioningResult {
		this.reset();
		
		// Phase 1: Index all entities
		this.indexEntities(entities);
		
		// Phase 2: Build hierarchy (attach children to parents)
		this.buildHierarchy();
		
		// Phase 3: Detect circular dependencies
		this.detectCircularDependencies();
		
		// Phase 4: Calculate container sizes (bottom-up)
		this.calculateAllContainerSizes();
		
		// Phase 5: Position workstreams and milestones
		this.positionWorkstreams();
		
		// Phase 6: Position children within containers
		this.positionAllChildren();
		
		// Phase 7: Position multi-parent entities
		this.positionMultiParentEntities();
		
		// Phase 8: Position orphans
		this.positionOrphans();
		
		// Phase 9: Resolve overlaps
		this.resolveOverlaps();
		
		// Collect final positions
		return this.collectResults();
	}

	private reset(): void {
		this.entityMap.clear();
		this.nodeIdToEntityId.clear();
		this.entityIdToNodeId.clear();
		this.processedNodes.clear();
		this.workstreams.clear();
		this.multiParentEntities = [];
		this.orphanedEntities = [];
		this.crossWorkstreamBands = [];
		this.errors = [];
		this.warnings = [];
	}

	// ========================================================================
	// Phase 1: Index Entities
	// ========================================================================

	private indexEntities(entities: EntityData[]): void {
		for (const entity of entities) {
			// Validate and clean self-referential relationships
			const selfId = entity.entityId;

			// Remove self from depends_on
			if (entity.dependsOn.includes(selfId)) {
				this.warnings.push(`Entity ${selfId} depends_on itself - removing self-reference`);
				entity.dependsOn = entity.dependsOn.filter(id => id !== selfId);
			}

			// Remove self from blocks
			if (entity.blocks.includes(selfId)) {
				this.warnings.push(`Entity ${selfId} blocks itself - removing self-reference`);
				entity.blocks = entity.blocks.filter(id => id !== selfId);
			}

			// Remove self from enables
			if (entity.enables.includes(selfId)) {
				this.warnings.push(`Entity ${selfId} enables itself - removing self-reference`);
				entity.enables = entity.enables.filter(id => id !== selfId);
			}

			// Remove self from implementedBy
			if (entity.implementedBy.includes(selfId)) {
				this.warnings.push(`Entity ${selfId} implementedBy itself - removing self-reference`);
				entity.implementedBy = entity.implementedBy.filter(id => id !== selfId);
			}

			// Remove self from implements
			if (entity.implements.includes(selfId)) {
				this.warnings.push(`Entity ${selfId} implements itself - removing self-reference`);
				entity.implements = entity.implements.filter(id => id !== selfId);
			}

			// Remove self from parent
			if (entity.parent === selfId) {
				this.warnings.push(`Entity ${selfId} has itself as parent - removing self-reference`);
				entity.parent = undefined;
			}

			this.entityMap.set(entity.entityId, entity);
			this.nodeIdToEntityId.set(entity.nodeId, entity.entityId);
			this.entityIdToNodeId.set(entity.entityId, entity.nodeId);

			// Create processed node
			const node: ProcessedNode = {
				entityId: entity.entityId,
				nodeId: entity.nodeId,
				type: entity.type,
				workstream: entity.workstream,
				data: entity,
				children: [],
			};
			this.processedNodes.set(entity.entityId, node);
		}

		console.log(`[PositioningV3] Indexed ${entities.length} entities`);
	}

	// ========================================================================
	// Phase 2: Build Hierarchy
	// ========================================================================

	private buildHierarchy(): void {
		// Process in order: Decisions, Tasks, Documents, Features, Stories, Milestones
		this.attachDecisions();
		this.attachTasks();
		this.attachDocumentsAndFeatures('document');
		this.attachDocumentsAndFeatures('feature');
		this.attachStories();
		this.groupMilestonesByWorkstream();
	}

	private attachDecisions(): void {
		const decisions = Array.from(this.processedNodes.values())
			.filter(n => n.type === 'decision');

		for (const decision of decisions) {
			const targets = [
				...decision.data.blocks,
				...decision.data.enables,
			];

			if (targets.length === 0) {
				// Orphaned decision
				this.orphanedEntities.push(decision);
			} else if (targets.length === 1) {
				// Single parent - decision is child of what it blocks/enables
				const parentId = targets[0];
				const parent = this.processedNodes.get(parentId);
				if (parent) {
					parent.children.push(decision);
				} else {
					this.warnings.push(`Decision ${decision.entityId} targets unknown entity ${parentId}`);
					this.orphanedEntities.push(decision);
				}
			} else {
				// Multi-parent
				const parentWorkstreams = new Set<string>();
				for (const pid of targets) {
					const p = this.processedNodes.get(pid);
					if (p) parentWorkstreams.add(p.workstream);
				}
				this.multiParentEntities.push({
					node: decision,
					parentEntityIds: targets,
					parentWorkstreams,
				});
			}
		}
	}

	private attachTasks(): void {
		const tasks = Array.from(this.processedNodes.values())
			.filter(n => n.type === 'task');

		for (const task of tasks) {
			if (task.data.parent) {
				const parent = this.processedNodes.get(task.data.parent);
				if (parent) {
					parent.children.push(task);
				} else {
					this.warnings.push(`Task ${task.entityId} has unknown parent ${task.data.parent}`);
					this.orphanedEntities.push(task);
				}
			} else {
				this.orphanedEntities.push(task);
			}
		}
	}

	private attachDocumentsAndFeatures(type: 'document' | 'feature'): void {
		const entities = Array.from(this.processedNodes.values())
			.filter(n => n.type === type);

		for (const entity of entities) {
			const implementers = entity.data.implementedBy || [];

			if (implementers.length === 0) {
				this.orphanedEntities.push(entity);
			} else if (implementers.length === 1) {
				// Single parent - attach to implementer
				const parentId = implementers[0];
				const parent = this.processedNodes.get(parentId);
				if (parent) {
					parent.children.push(entity);
				} else {
					this.warnings.push(`${type} ${entity.entityId} implemented by unknown entity ${parentId}`);
					this.orphanedEntities.push(entity);
				}
			} else {
				// Multi-parent
				const parentWorkstreams = new Set<string>();
				for (const pid of implementers) {
					const p = this.processedNodes.get(pid);
					if (p) parentWorkstreams.add(p.workstream);
				}
				this.multiParentEntities.push({
					node: entity,
					parentEntityIds: implementers,
					parentWorkstreams,
				});
			}
		}
	}

	private attachStories(): void {
		const stories = Array.from(this.processedNodes.values())
			.filter(n => n.type === 'story');

		for (const story of stories) {
			if (story.data.parent) {
				const parent = this.processedNodes.get(story.data.parent);
				if (parent) {
					parent.children.push(story);
				} else {
					this.warnings.push(`Story ${story.entityId} has unknown parent ${story.data.parent}`);
					this.orphanedEntities.push(story);
				}
			} else {
				this.orphanedEntities.push(story);
			}
		}
	}

	private groupMilestonesByWorkstream(): void {
		const milestones = Array.from(this.processedNodes.values())
			.filter(n => n.type === 'milestone');

		for (const milestone of milestones) {
			const ws = milestone.workstream || 'unassigned';
			if (!this.workstreams.has(ws)) {
				this.workstreams.set(ws, {
					name: ws,
					milestones: [],
					baseY: 0,
					height: 0,
				});
			}
			this.workstreams.get(ws)!.milestones.push(milestone);
		}

		console.log(`[PositioningV3] Grouped milestones into ${this.workstreams.size} workstreams`);
	}

	// ========================================================================
	// Phase 3: Detect Circular Dependencies
	// ========================================================================

	private detectCircularDependencies(): void {
		// Check for cycles in milestone dependencies within each workstream
		// Build a directed graph where edge A → B means A must be LEFT of B
		// (i.e., A blocks B, or B depends_on A)
		for (const [wsName, ws] of this.workstreams) {
			const milestoneIds = new Set(ws.milestones.map(m => m.entityId));

			// Build adjacency list: edge from A to B means A is LEFT of B
			const graph = new Map<string, Set<string>>();
			for (const m of ws.milestones) {
				graph.set(m.entityId, new Set());
			}

			for (const m of ws.milestones) {
				// If A blocks B, A is LEFT of B (A → B)
				for (const blockedId of m.data.blocks) {
					if (milestoneIds.has(blockedId)) {
						graph.get(m.entityId)!.add(blockedId);
					}
				}
				// If A depends_on B, B is LEFT of A (B → A)
				for (const depId of m.data.dependsOn) {
					if (milestoneIds.has(depId)) {
						if (!graph.has(depId)) graph.set(depId, new Set());
						graph.get(depId)!.add(m.entityId);
					}
				}
			}

			// DFS to detect cycles
			const visited = new Set<string>();
			const recursionStack = new Set<string>();
			const cyclesFound = new Set<string>();  // Avoid duplicate cycle reports

			const hasCycle = (nodeId: string, path: string[]): boolean => {
				if (recursionStack.has(nodeId)) {
					const cycleStart = path.indexOf(nodeId);
					const cycle = path.slice(cycleStart).concat(nodeId);
					const cycleKey = cycle.sort().join(',');
					if (!cyclesFound.has(cycleKey)) {
						cyclesFound.add(cycleKey);
						this.errors.push(`Circular dependency detected in workstream "${wsName}": ${cycle.join(' → ')}`);
					}
					return true;
				}
				if (visited.has(nodeId)) return false;

				visited.add(nodeId);
				recursionStack.add(nodeId);

				for (const neighbor of graph.get(nodeId) || []) {
					if (hasCycle(neighbor, [...path, nodeId])) {
						// Continue checking other neighbors to find all cycles
					}
				}

				recursionStack.delete(nodeId);
				return false;
			};

			for (const m of ws.milestones) {
				if (!visited.has(m.entityId)) {
					hasCycle(m.entityId, []);
				}
			}
		}
	}

	// ========================================================================
	// Phase 4: Calculate Container Sizes (Bottom-Up)
	// ========================================================================

	private calculateAllContainerSizes(): void {
		// Calculate sizes for all milestones (which recursively calculates children)
		for (const ws of this.workstreams.values()) {
			for (const milestone of ws.milestones) {
				this.calculateContainerSize(milestone);
			}
		}

		// Calculate sizes for orphaned entities
		for (const orphan of this.orphanedEntities) {
			this.calculateContainerSize(orphan);
		}
	}

	private calculateContainerSize(node: ProcessedNode): ContainerSize {
		if (node.containerSize) return node.containerSize;

		const nodeSize = this.config.nodeSizes[node.type];

		if (node.children.length === 0) {
			// Leaf node
			node.containerSize = {
				width: nodeSize.width,
				height: nodeSize.height,
				gridColumns: 0,
				gridRows: 0,
			};
			return node.containerSize;
		}

		// Recursively calculate children sizes first
		for (const child of node.children) {
			this.calculateContainerSize(child);
		}

		// Check if siblings have dependencies - use chain layout if so
		const hasDeps = this.hasSiblingDependencies(node.children);

		if (hasDeps) {
			// Chain layout: sort by dependency, place horizontally in sequence
			const sortedChildren = this.sortSiblingsByDependency(node.children);
			// Update children order for positioning phase
			node.children = sortedChildren;

			// Calculate chain dimensions (all children in a row)
			let chainWidth = 0;
			let chainHeight = 0;

			for (const child of sortedChildren) {
				const childSize = child.containerSize!;
				chainWidth += childSize.width;
				chainHeight = Math.max(chainHeight, childSize.height);
			}
			chainWidth += (sortedChildren.length - 1) * this.config.childGap;

			node.containerSize = {
				width: chainWidth + this.config.childGap + nodeSize.width,
				height: Math.max(chainHeight, nodeSize.height),
				gridColumns: sortedChildren.length,  // All in one row
				gridRows: 1,
			};
		} else {
			// Grid layout: optimal arrangement preferring taller layouts
			const grid = this.calculateOptimalGrid(node.children);
			const n = node.children.length;

			// Calculate how many items are in the incomplete top row
			const itemsInTopRow = n % grid.columns || grid.columns;
			const emptySlots = grid.columns - itemsInTopRow;

			// Group children by grid position and calculate max dimensions per row/column
			// Using same filling logic as positioning: empty slots at top-left
			const rowHeights: number[] = new Array(grid.rows).fill(0);
			const colWidths: number[] = new Array(grid.columns).fill(0);

			for (let i = 0; i < n; i++) {
				const adjustedIndex = i + emptySlots;
				const col = adjustedIndex % grid.columns;
				const row = Math.floor(adjustedIndex / grid.columns);
				const childSize = node.children[i].containerSize!;

				colWidths[col] = Math.max(colWidths[col], childSize.width);
				rowHeights[row] = Math.max(rowHeights[row], childSize.height);
			}

			const gridWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length - 1) * this.config.childGap;
			const gridHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (rowHeights.length - 1) * this.config.childGap;

			node.containerSize = {
				width: gridWidth + this.config.childGap + nodeSize.width,
				height: Math.max(gridHeight, nodeSize.height),
				gridColumns: grid.columns,
				gridRows: grid.rows,
			};
		}

		return node.containerSize;
	}

	/**
	 * Calculate optimal grid arrangement based on actual container sizes.
	 * Goal: minimize the longer side (in pixels), prefer taller layouts.
	 * Children are positioned to the LEFT and ABOVE the parent,
	 * with the rightmost column being the longest (filled from bottom-right).
	 */
	private calculateOptimalGrid(children: ProcessedNode[]): { columns: number; rows: number } {
		const n = children.length;
		if (n === 0) return { columns: 0, rows: 0 };
		if (n === 1) return { columns: 1, rows: 1 };

		// Sort children by container size (largest first) for consistent assignment
		const sortedChildren = [...children].sort((a, b) => {
			const aSize = (a.containerSize?.width || 0) * (a.containerSize?.height || 0);
			const bSize = (b.containerSize?.width || 0) * (b.containerSize?.height || 0);
			return bSize - aSize;
		});

		// Try all possible column counts from 1 to n
		// Goal: minimize max(gridWidth, gridHeight), prefer taller layouts
		let bestMaxSide = Infinity;
		let bestCols = 1;
		let bestRows = n;

		for (let cols = 1; cols <= n; cols++) {
			const rows = Math.ceil(n / cols);

			// Calculate actual grid dimensions by simulating child placement
			const colWidths: number[] = new Array(cols).fill(0);
			const rowHeights: number[] = new Array(rows).fill(0);

			// Simulate placement (same logic as actual positioning)
			const itemsInTopRow = n % cols || cols;
			const emptySlots = cols - itemsInTopRow;

			for (let i = 0; i < n; i++) {
				const child = sortedChildren[i];
				const adjustedIndex = i + emptySlots;
				const row = Math.floor(adjustedIndex / cols);
				const col = adjustedIndex % cols;

				const childWidth = child.containerSize?.width || this.config.nodeSizes[child.type].width;
				const childHeight = child.containerSize?.height || this.config.nodeSizes[child.type].height;

				colWidths[col] = Math.max(colWidths[col], childWidth);
				rowHeights[row] = Math.max(rowHeights[row], childHeight);
			}

			const gridWidth = colWidths.reduce((sum, w) => sum + w, 0) + (cols - 1) * this.config.childGap;
			const gridHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (rows - 1) * this.config.childGap;
			const maxSide = Math.max(gridWidth, gridHeight);

			// Prefer this arrangement if:
			// 1. It has a smaller max side, OR
			// 2. Same max side but taller (gridHeight > gridWidth)
			const isBetter = maxSide < bestMaxSide ||
				(maxSide === bestMaxSide && gridHeight > gridWidth);

			if (isBetter) {
				bestMaxSide = maxSide;
				bestCols = cols;
				bestRows = rows;
			}
		}

		return { columns: bestCols, rows: bestRows };
	}

	/**
	 * Check if siblings have dependency relationships (blocks/depends_on)
	 */
	private hasSiblingDependencies(children: ProcessedNode[]): boolean {
		if (children.length <= 1) return false;

		const siblingIds = new Set(children.map(c => c.entityId));

		for (const child of children) {
			// Check if any blocks target is a sibling
			for (const blockedId of child.data.blocks) {
				if (siblingIds.has(blockedId)) return true;
			}
			// Check if any depends_on target is a sibling
			for (const depId of child.data.dependsOn) {
				if (siblingIds.has(depId)) return true;
			}
		}
		return false;
	}

	/**
	 * Sort siblings by dependency order (same logic as milestones)
	 * Returns sorted array where blockers come before blocked, dependencies before dependents
	 */
	private sortSiblingsByDependency(siblings: ProcessedNode[]): ProcessedNode[] {
		if (siblings.length <= 1) return siblings;

		const siblingIds = new Set(siblings.map(s => s.entityId));

		// Build adjacency list: edge from A to B means A should be LEFT of B
		const graph = new Map<string, Set<string>>();
		const inDegree = new Map<string, number>();

		for (const s of siblings) {
			graph.set(s.entityId, new Set());
			inDegree.set(s.entityId, 0);
		}

		for (const s of siblings) {
			// If A blocks B, A is LEFT of B (A → B)
			for (const blockedId of s.data.blocks) {
				if (siblingIds.has(blockedId)) {
					graph.get(s.entityId)!.add(blockedId);
					inDegree.set(blockedId, (inDegree.get(blockedId) || 0) + 1);
				}
			}

			// If A depends_on B, B is LEFT of A (B → A)
			for (const depId of s.data.dependsOn) {
				if (siblingIds.has(depId)) {
					graph.get(depId)!.add(s.entityId);
					inDegree.set(s.entityId, (inDegree.get(s.entityId) || 0) + 1);
				}
			}
		}

		// Topological sort using Kahn's algorithm
		const queue: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) queue.push(id);
		}

		const sorted: ProcessedNode[] = [];
		const siblingMap = new Map(siblings.map(s => [s.entityId, s]));

		while (queue.length > 0) {
			queue.sort();  // Alphabetical for determinism
			const id = queue.shift()!;
			sorted.push(siblingMap.get(id)!);

			for (const neighbor of graph.get(id) || []) {
				const newDegree = (inDegree.get(neighbor) || 0) - 1;
				inDegree.set(neighbor, newDegree);
				if (newDegree === 0) queue.push(neighbor);
			}
		}

		// Add any remaining (cycle) at the end
		if (sorted.length < siblings.length) {
			for (const s of siblings) {
				if (!sorted.includes(s)) {
					sorted.push(s);
				}
			}
		}

		return sorted;
	}

	// ========================================================================
	// Phase 5: Position Workstreams and Milestones
	// ========================================================================

	private positionWorkstreams(): void {
		// Sort workstreams alphabetically for consistent ordering
		// Filter out empty workstreams
		const sortedWorkstreams = Array.from(this.workstreams.values())
			.filter(ws => ws.milestones.length > 0)
			.sort((a, b) => a.name.localeCompare(b.name));

		if (sortedWorkstreams.length === 0) {
			console.log('[PositioningV3] No workstreams with milestones to position');
			return;
		}

		// Calculate workstream heights
		let totalHeight = 0;
		for (const ws of sortedWorkstreams) {
			let maxHeight = 0;
			for (const m of ws.milestones) {
				maxHeight = Math.max(maxHeight, m.containerSize?.height || 0);
			}
			ws.height = Math.max(maxHeight, this.config.nodeSizes.milestone.height);
			totalHeight += ws.height;
		}
		totalHeight += Math.max(0, sortedWorkstreams.length - 1) * this.config.workstreamGap;

		// Sort milestones within each workstream by intra-workstream dependencies
		const sortedMilestonesByWs = new Map<string, ProcessedNode[]>();
		for (const ws of sortedWorkstreams) {
			sortedMilestonesByWs.set(ws.name, this.sortMilestonesByIntraWorkstreamDeps(ws.milestones));
		}

		// Collect cross-workstream dependencies
		// If milestone B depends on milestone A (different workstream), B must be RIGHT of A
		const crossWsDeps: { source: string; target: string }[] = [];
		const allMilestoneIds = new Set<string>();
		for (const ws of sortedWorkstreams) {
			for (const m of ws.milestones) {
				allMilestoneIds.add(m.entityId);
			}
		}

		for (const ws of sortedWorkstreams) {
			for (const m of ws.milestones) {
				// Check depends_on for cross-workstream deps
				for (const depId of m.data.dependsOn) {
					if (allMilestoneIds.has(depId)) {
						const depNode = this.processedNodes.get(depId);
						if (depNode && depNode.workstream !== m.workstream) {
							crossWsDeps.push({ source: depId, target: m.entityId });
						}
					}
				}
				// Check blocks for cross-workstream deps
				for (const blockedId of m.data.blocks) {
					if (allMilestoneIds.has(blockedId)) {
						const blockedNode = this.processedNodes.get(blockedId);
						if (blockedNode && blockedNode.workstream !== m.workstream) {
							crossWsDeps.push({ source: m.entityId, target: blockedId });
						}
					}
				}
			}
		}

		// Position milestones with constraint propagation
		// Each milestone's X is: max(previous in workstream, all cross-ws dependencies)
		const milestoneX = new Map<string, number>(); // entityId -> container start X
		const milestoneEndX = new Map<string, number>(); // entityId -> container end X

		// Initialize all milestones with X=0
		for (const ws of sortedWorkstreams) {
			for (const m of ws.milestones) {
				milestoneX.set(m.entityId, 0);
				milestoneEndX.set(m.entityId, m.containerSize?.width || this.config.nodeSizes.milestone.width);
			}
		}

		// Multiple passes to resolve all constraints (intra and cross-workstream)
		const maxIterations = 20;
		for (let iteration = 0; iteration < maxIterations; iteration++) {
			let changed = false;

			for (const ws of sortedWorkstreams) {
				const sortedMilestones = sortedMilestonesByWs.get(ws.name)!;

				for (let i = 0; i < sortedMilestones.length; i++) {
					const milestone = sortedMilestones[i];
					const containerWidth = milestone.containerSize?.width || this.config.nodeSizes.milestone.width;

					// Constraint 1: Must be after previous milestone in same workstream
					let minX = 0;
					if (i > 0) {
						const prevMilestone = sortedMilestones[i - 1];
						const prevEndX = milestoneEndX.get(prevMilestone.entityId) || 0;
						minX = prevEndX + this.config.containerGap;
					}

					// Constraint 2: Must be after all cross-workstream dependencies
					for (const dep of crossWsDeps) {
						if (dep.target === milestone.entityId) {
							const sourceEndX = milestoneEndX.get(dep.source) || 0;
							minX = Math.max(minX, sourceEndX + this.config.containerGap);
						}
					}

					const oldX = milestoneX.get(milestone.entityId) || 0;
					if (minX > oldX) {
						milestoneX.set(milestone.entityId, minX);
						milestoneEndX.set(milestone.entityId, minX + containerWidth);
						changed = true;
					}
				}
			}

			if (!changed) {
				console.log(`[PositioningV3] Constraint propagation converged after ${iteration + 1} iterations`);
				break;
			}
		}

		// Position workstreams vertically centered
		let currentY = -totalHeight / 2;

		for (const ws of sortedWorkstreams) {
			ws.baseY = currentY;

			for (const milestone of ws.milestones) {
				const containerSize = milestone.containerSize!;
				const nodeSize = this.config.nodeSizes.milestone;
				const containerX = milestoneX.get(milestone.entityId) || 0;

				// Milestone node is at the RIGHT of its container
				milestone.position = {
					x: containerX + containerSize.width - nodeSize.width,
					y: currentY + (ws.height - nodeSize.height) / 2,
					width: nodeSize.width,
					height: nodeSize.height,
				};
			}

			currentY += ws.height + this.config.workstreamGap;
		}

		console.log(`[PositioningV3] Positioned ${sortedWorkstreams.length} workstreams with cross-workstream alignment`);
	}

	/**
	 * Sort milestones by intra-workstream dependencies only
	 */
	private sortMilestonesByIntraWorkstreamDeps(milestones: ProcessedNode[]): ProcessedNode[] {
		if (milestones.length <= 1) return milestones;

		const milestoneIds = new Set(milestones.map(m => m.entityId));

		// Build adjacency list for intra-workstream dependencies only
		const graph = new Map<string, Set<string>>();
		const inDegree = new Map<string, number>();

		for (const m of milestones) {
			graph.set(m.entityId, new Set());
			inDegree.set(m.entityId, 0);
		}

		for (const m of milestones) {
			// If A blocks B (same workstream), A is LEFT of B
			for (const blockedId of m.data.blocks) {
				if (milestoneIds.has(blockedId)) {
					graph.get(m.entityId)!.add(blockedId);
					inDegree.set(blockedId, (inDegree.get(blockedId) || 0) + 1);
				}
			}

			// If A depends_on B (same workstream), B is LEFT of A
			for (const depId of m.data.dependsOn) {
				if (milestoneIds.has(depId)) {
					graph.get(depId)!.add(m.entityId);
					inDegree.set(m.entityId, (inDegree.get(m.entityId) || 0) + 1);
				}
			}
		}

		// Topological sort
		const queue: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) queue.push(id);
		}
		queue.sort();

		const sorted: ProcessedNode[] = [];
		while (queue.length > 0) {
			const id = queue.shift()!;
			const node = milestones.find(m => m.entityId === id);
			if (node) sorted.push(node);

			for (const neighbor of graph.get(id) || []) {
				const newDegree = (inDegree.get(neighbor) || 0) - 1;
				inDegree.set(neighbor, newDegree);
				if (newDegree === 0) {
					queue.push(neighbor);
					queue.sort();
				}
			}
		}

		// Add remaining (cycle members)
		if (sorted.length < milestones.length) {
			const sortedIds = new Set(sorted.map(m => m.entityId));
			const remaining = milestones
				.filter(m => !sortedIds.has(m.entityId))
				.sort((a, b) => a.entityId.localeCompare(b.entityId));
			sorted.push(...remaining);
		}

		return sorted;
	}

	// ========================================================================
	// Phase 6: Position Children Within Containers
	// ========================================================================

	private positionAllChildren(): void {
		// Position children for all milestones
		for (const ws of this.workstreams.values()) {
			for (const milestone of ws.milestones) {
				if (milestone.position) {
					this.positionChildrenRecursive(milestone);
				}
			}
		}
	}

	private positionChildrenRecursive(parent: ProcessedNode): void {
		if (parent.children.length === 0) return;

		const parentPos = parent.position!;

		// Check if siblings have dependencies - already sorted in calculateContainerSize
		const hasDeps = this.hasSiblingDependencies(parent.children);

		if (hasDeps) {
			// Chain layout: children are already sorted by dependency
			// Position them in a horizontal chain, each child's container to the left of the next
			let chainHeight = 0;
			for (const child of parent.children) {
				chainHeight = Math.max(chainHeight, child.containerSize!.height);
			}

			// Start from the right (closest to parent) and work left
			// Chain is positioned ABOVE parent (bottom of chain aligns with top of parent)
			let currentX = parentPos.x - this.config.childGap;
			const chainY = parentPos.y - this.config.childGap - chainHeight;

			// Position children from right to left (reverse order since leftmost should be first in dependency)
			for (let i = parent.children.length - 1; i >= 0; i--) {
				const child = parent.children[i];
				const childNodeSize = this.config.nodeSizes[child.type];
				const childContainerSize = child.containerSize!;

				// Child's node is at the RIGHT of its container
				child.position = {
					x: currentX - childNodeSize.width,
					y: chainY + (chainHeight - childNodeSize.height) / 2,
					width: childNodeSize.width,
					height: childNodeSize.height,
				};

				// Move left for next child
				currentX -= childContainerSize.width + this.config.childGap;

				// Recursively position grandchildren
				this.positionChildrenRecursive(child);
			}
		} else {
			// Grid layout: use optimal grid arrangement
			// Sort children by container size (largest first) to prevent overlaps
			// Children with more descendants go to upper-left, leaf children go to bottom-right
			parent.children.sort((a, b) => {
				const aSize = (a.containerSize?.width || 0) * (a.containerSize?.height || 0);
				const bSize = (b.containerSize?.width || 0) * (b.containerSize?.height || 0);
				return bSize - aSize; // Descending order (largest first)
			});

			const grid = this.calculateOptimalGrid(parent.children);
			const n = parent.children.length;

			// Calculate how many items are in the incomplete top row
			const itemsInTopRow = n % grid.columns || grid.columns;
			const emptySlots = grid.columns - itemsInTopRow;

			// Build grid positions: fill from bottom-right, so incomplete row is at top-left
			// We'll assign each child to a (row, col) position
			const childPositions: { child: ProcessedNode; row: number; col: number }[] = [];

			for (let i = 0; i < n; i++) {
				const child = parent.children[i];
				// Fill bottom-to-top, right-to-left within each row
				// But we want rightmost column to be longest, so:
				// - Bottom rows are full (all columns)
				// - Top row may be incomplete, with items on the RIGHT

				// Calculate position as if filling top-to-bottom, left-to-right
				// but with empty slots at top-left
				const adjustedIndex = i + emptySlots; // Shift to account for empty slots
				const row = Math.floor(adjustedIndex / grid.columns);
				const col = adjustedIndex % grid.columns;

				childPositions.push({ child, row, col });
			}

			// Calculate actual grid dimensions based on child sizes per row/col
			const rowHeights: number[] = new Array(grid.rows).fill(0);
			const colWidths: number[] = new Array(grid.columns).fill(0);

			for (const { child, row, col } of childPositions) {
				const childSize = child.containerSize!;
				colWidths[col] = Math.max(colWidths[col], childSize.width);
				rowHeights[row] = Math.max(rowHeights[row], childSize.height);
			}

			const gridWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length - 1) * this.config.childGap;
			const gridHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (rowHeights.length - 1) * this.config.childGap;

			// Grid starts LEFT of parent, ABOVE parent (bottom of grid aligns with top of parent)
			const gridStartX = parentPos.x - this.config.childGap - gridWidth;
			const gridStartY = parentPos.y - this.config.childGap - gridHeight;

			// Position each child
			for (const { child, row, col } of childPositions) {
				// Calculate X position (sum of previous column widths + gaps)
				let childX = gridStartX;
				for (let c = 0; c < col; c++) {
					childX += colWidths[c] + this.config.childGap;
				}

				// Calculate Y position (sum of previous row heights + gaps)
				let childY = gridStartY;
				for (let r = 0; r < row; r++) {
					childY += rowHeights[r] + this.config.childGap;
				}

				// Child's node is at the RIGHT of its container
				const childNodeSize = this.config.nodeSizes[child.type];
				const childContainerSize = child.containerSize!;

				child.position = {
					x: childX + childContainerSize.width - childNodeSize.width,
					y: childY + (rowHeights[row] - childNodeSize.height) / 2,  // Center in row
					width: childNodeSize.width,
					height: childNodeSize.height,
				};

				// Recursively position grandchildren
				this.positionChildrenRecursive(child);
			}
		}
	}

	// ========================================================================
	// Phase 7: Position Multi-Parent Entities
	// ========================================================================

	private positionMultiParentEntities(): void {
		// Group by whether they cross workstreams
		const sameWorkstream: MultiParentEntity[] = [];
		const crossWorkstream: MultiParentEntity[] = [];

		for (const mpe of this.multiParentEntities) {
			if (mpe.parentWorkstreams.size === 1) {
				sameWorkstream.push(mpe);
			} else {
				crossWorkstream.push(mpe);
			}
		}

		// Position same-workstream entities centered above parents
		for (const mpe of sameWorkstream) {
			this.positionMultiParentSameWorkstream(mpe);
		}

		// Position cross-workstream entities in bands between workstreams
		this.positionCrossWorkstreamEntities(crossWorkstream);
	}

	private positionMultiParentSameWorkstream(mpe: MultiParentEntity): void {
		const parentPositions: NodePosition[] = [];

		for (const parentId of mpe.parentEntityIds) {
			const parent = this.processedNodes.get(parentId);
			if (parent?.position) {
				parentPositions.push(parent.position);
			}
		}

		if (parentPositions.length === 0) {
			// No positioned parents, treat as orphan
			this.orphanedEntities.push(mpe.node);
			return;
		}

		// Calculate center position
		const minX = Math.min(...parentPositions.map(p => p.x));
		const maxX = Math.max(...parentPositions.map(p => p.x + p.width));
		const minY = Math.min(...parentPositions.map(p => p.y));

		const nodeSize = this.config.nodeSizes[mpe.node.type];

		mpe.node.position = {
			x: (minX + maxX) / 2 - nodeSize.width / 2,
			y: minY - this.config.childGap - nodeSize.height,
			width: nodeSize.width,
			height: nodeSize.height,
		};
	}

	private positionCrossWorkstreamEntities(entities: MultiParentEntity[]): void {
		if (entities.length === 0) return;

		// Group by workstream pairs
		const byWorkstreamPair = new Map<string, MultiParentEntity[]>();

		for (const mpe of entities) {
			const wsArray = Array.from(mpe.parentWorkstreams).sort();
			const key = wsArray.join('|');
			if (!byWorkstreamPair.has(key)) {
				byWorkstreamPair.set(key, []);
			}
			byWorkstreamPair.get(key)!.push(mpe);
		}

		// For each pair, create a band between the workstreams
		for (const [key, mpes] of byWorkstreamPair) {
			const wsNames = key.split('|');
			const ws1 = this.workstreams.get(wsNames[0]);
			const ws2 = this.workstreams.get(wsNames[1]);

			if (!ws1 || !ws2) continue;

			// Find Y position between the two workstreams
			const ws1Bottom = ws1.baseY + ws1.height;
			const ws2Top = ws2.baseY;
			const bandY = (ws1Bottom + ws2Top) / 2;

			// Position entities in a row
			let currentX = 0;
			for (const mpe of mpes) {
				const nodeSize = this.config.nodeSizes[mpe.node.type];

				// Center horizontally between parents
				const parentPositions: NodePosition[] = [];
				for (const parentId of mpe.parentEntityIds) {
					const parent = this.processedNodes.get(parentId);
					if (parent?.position) parentPositions.push(parent.position);
				}

				let x = currentX;
				if (parentPositions.length > 0) {
					const minX = Math.min(...parentPositions.map(p => p.x));
					const maxX = Math.max(...parentPositions.map(p => p.x + p.width));
					x = (minX + maxX) / 2 - nodeSize.width / 2;
				}

				mpe.node.position = {
					x,
					y: bandY - nodeSize.height / 2,
					width: nodeSize.width,
					height: nodeSize.height,
				};

				currentX = x + nodeSize.width + this.config.childGap;
			}
		}
	}

	// ========================================================================
	// Phase 8: Position Orphans
	// ========================================================================

	private positionOrphans(): void {
		if (this.orphanedEntities.length === 0) return;

		// Find the bottom-left of all positioned content
		let maxY = 0;
		for (const node of this.processedNodes.values()) {
			if (node.position) {
				maxY = Math.max(maxY, node.position.y + node.position.height);
			}
		}

		// Position orphans in a grid below all workstreams
		const grid = this.calculateOptimalGrid(this.orphanedEntities);
		const startX = 0;
		const startY = maxY + this.config.orphanGap;

		// Calculate max dimensions for uniform grid cells
		let maxWidth = 0;
		let maxHeight = 0;
		for (const orphan of this.orphanedEntities) {
			const size = this.config.nodeSizes[orphan.type];
			maxWidth = Math.max(maxWidth, size.width);
			maxHeight = Math.max(maxHeight, size.height);
		}

		for (let i = 0; i < this.orphanedEntities.length; i++) {
			const orphan = this.orphanedEntities[i];
			const col = i % grid.columns;
			const row = Math.floor(i / grid.columns);
			const nodeSize = this.config.nodeSizes[orphan.type];

			orphan.position = {
				x: startX + col * (maxWidth + this.config.childGap),
				y: startY + row * (maxHeight + this.config.childGap),
				width: nodeSize.width,
				height: nodeSize.height,
			};
		}

		console.log(`[PositioningV3] Positioned ${this.orphanedEntities.length} orphaned entities`);
	}

	// ========================================================================
	// Phase 9: Resolve Overlaps
	// ========================================================================

	private resolveOverlaps(): void {
		// Collect all positioned nodes
		const allNodes: ProcessedNode[] = [];
		for (const node of this.processedNodes.values()) {
			if (node.position) allNodes.push(node);
		}

		// Simple overlap resolution: push overlapping nodes apart
		const maxIterations = 50;
		let iteration = 0;
		let hasOverlap = true;

		while (hasOverlap && iteration < maxIterations) {
			hasOverlap = false;
			iteration++;

			for (let i = 0; i < allNodes.length; i++) {
				for (let j = i + 1; j < allNodes.length; j++) {
					const nodeA = allNodes[i];
					const nodeB = allNodes[j];

					if (this.nodesOverlap(nodeA.position!, nodeB.position!)) {
						hasOverlap = true;
						this.resolveNodeOverlap(nodeA, nodeB);
					}
				}
			}
		}

		if (iteration >= maxIterations) {
			this.warnings.push(`Overlap resolution reached max iterations (${maxIterations})`);
		}
	}

	private nodesOverlap(a: NodePosition, b: NodePosition, padding: number = 10): boolean {
		return !(
			a.x + a.width + padding <= b.x ||
			b.x + b.width + padding <= a.x ||
			a.y + a.height + padding <= b.y ||
			b.y + b.height + padding <= a.y
		);
	}

	private resolveNodeOverlap(nodeA: ProcessedNode, nodeB: ProcessedNode): void {
		const posA = nodeA.position!;
		const posB = nodeB.position!;

		// Determine which node to move based on type priority
		// Milestones stay fixed, then stories, then tasks, then others
		const priorityOrder: EntityType[] = ['milestone', 'story', 'task', 'decision', 'document', 'feature'];
		const priorityA = priorityOrder.indexOf(nodeA.type);
		const priorityB = priorityOrder.indexOf(nodeB.type);

		const nodeToMove = priorityB >= priorityA ? nodeB : nodeA;
		const posToMove = nodeToMove.position!;
		const otherPos = nodeToMove === nodeB ? posA : posB;

		// Calculate overlap and push apart
		const overlapX = Math.min(
			otherPos.x + otherPos.width - posToMove.x,
			posToMove.x + posToMove.width - otherPos.x
		);
		const overlapY = Math.min(
			otherPos.y + otherPos.height - posToMove.y,
			posToMove.y + posToMove.height - otherPos.y
		);

		// Push in the direction of least overlap
		if (overlapX < overlapY) {
			const pushDirection = posToMove.x >= otherPos.x ? 1 : -1;
			posToMove.x += pushDirection * (overlapX + 20);
		} else {
			const pushDirection = posToMove.y >= otherPos.y ? 1 : -1;
			posToMove.y += pushDirection * (overlapY + 20);
		}
	}

	// ========================================================================
	// Collect Results
	// ========================================================================

	private collectResults(): PositioningResult {
		const positions = new Map<string, NodePosition>();

		for (const node of this.processedNodes.values()) {
			if (node.position) {
				positions.set(node.nodeId, node.position);
			}
		}

		console.log(`[PositioningV3] Calculated positions for ${positions.size} nodes`);
		console.log(`[PositioningV3] Errors: ${this.errors.length}, Warnings: ${this.warnings.length}`);

		return {
			positions,
			errors: this.errors,
			warnings: this.warnings,
		};
	}
}
