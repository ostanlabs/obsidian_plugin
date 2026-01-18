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
	workstreamGap: 340,
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

		// First pass: attach tasks with explicit parent
		const tasksWithoutParent: ProcessedNode[] = [];
		for (const task of tasks) {
			if (task.data.parent) {
				const parent = this.processedNodes.get(task.data.parent);
				if (parent) {
					parent.children.push(task);
				} else {
					this.warnings.push(`Task ${task.entityId} has unknown parent ${task.data.parent}`);
					tasksWithoutParent.push(task);
				}
			} else {
				tasksWithoutParent.push(task);
			}
		}

		// Second pass: for tasks without parent, check if they have blocks relationships
		// If a task blocks other tasks, treat the blocked tasks as "children" for positioning
		// This creates a dependency chain: blocker -> blocked (left to right)
		const taskEntityIds = new Set(tasksWithoutParent.map(t => t.entityId));
		const attachedViaBlocks = new Set<string>();

		// Build reverse mapping: who blocks whom
		const blockedBy = new Map<string, string[]>(); // entityId -> [entityIds that block it]
		for (const task of tasksWithoutParent) {
			// From blocks field: this task blocks others
			for (const blockedId of task.data.blocks || []) {
				if (taskEntityIds.has(blockedId)) {
					if (!blockedBy.has(blockedId)) blockedBy.set(blockedId, []);
					blockedBy.get(blockedId)!.push(task.entityId);
				}
			}
			// From depends_on field: this task is blocked by others
			for (const blockerId of task.data.dependsOn || []) {
				if (taskEntityIds.has(blockerId)) {
					if (!blockedBy.has(task.entityId)) blockedBy.set(task.entityId, []);
					blockedBy.get(task.entityId)!.push(blockerId);
				}
			}
		}

		// Find root tasks (tasks that block others but are not blocked by any task in this set)
		const rootTasks: ProcessedNode[] = [];
		for (const task of tasksWithoutParent) {
			const blockers = blockedBy.get(task.entityId) || [];
			if (blockers.length === 0 && (task.data.blocks?.some(id => taskEntityIds.has(id)))) {
				rootTasks.push(task);
			}
		}

		// For each root task, attach blocked tasks as children recursively
		const attachBlockedAsChildren = (blocker: ProcessedNode, visited: Set<string>) => {
			if (visited.has(blocker.entityId)) return;
			visited.add(blocker.entityId);
			attachedViaBlocks.add(blocker.entityId);

			for (const blockedId of blocker.data.blocks || []) {
				if (!taskEntityIds.has(blockedId)) continue;
				const blocked = this.processedNodes.get(blockedId);
				if (blocked && !visited.has(blockedId)) {
					blocker.children.push(blocked);
					attachedViaBlocks.add(blockedId);
					attachBlockedAsChildren(blocked, visited);
				}
			}
		};

		for (const root of rootTasks) {
			attachBlockedAsChildren(root, new Set());
		}

		// Root tasks and any remaining unattached tasks go to orphans
		// But root tasks should be positioned together, not scattered
		for (const task of tasksWithoutParent) {
			if (!attachedViaBlocks.has(task.entityId)) {
				// Task has no blocks relationships with other orphan tasks
				this.orphanedEntities.push(task);
			} else if (rootTasks.includes(task)) {
				// Root of a dependency chain - goes to orphans but will have children
				this.orphanedEntities.push(task);
			}
			// Tasks attached as children via blocks are NOT added to orphans
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

		// Check if siblings have dependencies - use dependency-aware grid layout if so
		const hasDeps = this.hasSiblingDependencies(node.children);

		if (hasDeps) {
			// Dependency-aware grid layout: group by dependency level (topological depth)
			// Items at the same level are stacked vertically, levels progress left-to-right
			const levelAssignments = this.assignDependencyLevels(node.children);

			// Group children by level
			const levelGroups = new Map<number, ProcessedNode[]>();
			let maxLevel = 0;
			for (const { child, level } of levelAssignments) {
				if (!levelGroups.has(level)) {
					levelGroups.set(level, []);
				}
				levelGroups.get(level)!.push(child);
				maxLevel = Math.max(maxLevel, level);
			}

			// Calculate dimensions for each level (column)
			const colWidths: number[] = [];
			const colHeights: number[] = [];
			for (let level = 0; level <= maxLevel; level++) {
				const children = levelGroups.get(level) || [];
				let colWidth = 0;
				let colHeight = 0;
				for (const child of children) {
					const childSize = child.containerSize!;
					colWidth = Math.max(colWidth, childSize.width);
					colHeight += childSize.height;
				}
				if (children.length > 1) {
					colHeight += (children.length - 1) * this.config.childGap;
				}
				colWidths.push(colWidth);
				colHeights.push(colHeight);
			}

			const gridWidth = colWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, colWidths.length - 1) * this.config.childGap;
			const gridHeight = Math.max(...colHeights, 0);

			// Store level assignments for positioning phase
			(node as any)._levelAssignments = levelAssignments;
			(node as any)._colWidths = colWidths;
			(node as any)._gridHeight = gridHeight;

			node.containerSize = {
				width: gridWidth + this.config.childGap + nodeSize.width,
				height: gridHeight + this.config.childGap + nodeSize.height,
				gridColumns: maxLevel + 1,
				gridRows: Math.max(...Array.from(levelGroups.values()).map(g => g.length), 1),
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
				// Children are ABOVE parent with a gap, so total height = children + gap + parent
				height: gridHeight + this.config.childGap + nodeSize.height,
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
	 * Assign dependency levels to siblings for grid layout.
	 * Level 0 = no dependencies (leftmost), higher levels depend on lower levels.
	 * Items at the same level can be stacked vertically.
	 */
	private assignDependencyLevels(siblings: ProcessedNode[]): { child: ProcessedNode; level: number }[] {
		if (siblings.length === 0) return [];
		if (siblings.length === 1) return [{ child: siblings[0], level: 0 }];

		const siblingIds = new Set(siblings.map(s => s.entityId));

		// Build adjacency list: edge from A to B means A must be LEFT of B (lower level)
		const graph = new Map<string, Set<string>>();
		const reverseGraph = new Map<string, Set<string>>(); // For finding predecessors

		for (const s of siblings) {
			graph.set(s.entityId, new Set());
			reverseGraph.set(s.entityId, new Set());
		}

		for (const s of siblings) {
			// If A blocks B, A is LEFT of B (A → B)
			for (const blockedId of s.data.blocks) {
				if (siblingIds.has(blockedId) && !graph.get(s.entityId)!.has(blockedId)) {
					graph.get(s.entityId)!.add(blockedId);
					reverseGraph.get(blockedId)!.add(s.entityId);
				}
			}

			// If A depends_on B, B is LEFT of A (B → A)
			for (const depId of s.data.dependsOn) {
				if (siblingIds.has(depId) && !graph.get(depId)!.has(s.entityId)) {
					graph.get(depId)!.add(s.entityId);
					reverseGraph.get(s.entityId)!.add(depId);
				}
			}
		}

		// Calculate levels using longest path from roots
		const levels = new Map<string, number>();

		// Initialize: nodes with no predecessors are level 0
		const queue: string[] = [];
		for (const s of siblings) {
			if (reverseGraph.get(s.entityId)!.size === 0) {
				levels.set(s.entityId, 0);
				queue.push(s.entityId);
			}
		}

		// BFS to propagate levels
		while (queue.length > 0) {
			const id = queue.shift()!;
			const currentLevel = levels.get(id)!;

			for (const successor of graph.get(id)!) {
				const newLevel = currentLevel + 1;
				const existingLevel = levels.get(successor);

				if (existingLevel === undefined || newLevel > existingLevel) {
					levels.set(successor, newLevel);
				}

				// Check if all predecessors have been processed
				let allPredecessorsProcessed = true;
				for (const pred of reverseGraph.get(successor)!) {
					if (!levels.has(pred)) {
						allPredecessorsProcessed = false;
						break;
					}
				}

				if (allPredecessorsProcessed && !queue.includes(successor)) {
					queue.push(successor);
				}
			}
		}

		// Handle any nodes not reached (cycles or disconnected) - assign level 0
		for (const s of siblings) {
			if (!levels.has(s.entityId)) {
				levels.set(s.entityId, 0);
			}
		}

		// Build result sorted by level, then by entityId for consistency
		const result = siblings.map(child => ({
			child,
			level: levels.get(child.entityId)!
		}));

		result.sort((a, b) => {
			if (a.level !== b.level) return a.level - b.level;
			return a.child.entityId.localeCompare(b.child.entityId);
		});

		return result;
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
		// Filter out empty workstreams
		const nonEmptyWorkstreams = Array.from(this.workstreams.values())
			.filter(ws => ws.milestones.length > 0);

		// Order workstreams to minimize cross-workstream edge lengths
		// by placing workstreams with more dependencies on each other adjacent
		const sortedWorkstreams = this.orderWorkstreamsByDependencyDensity(nonEmptyWorkstreams);

		if (sortedWorkstreams.length === 0) {
			console.log('[PositioningV3] No workstreams with milestones to position');
			return;
		}

		// Calculate workstream heights
		let totalHeight = 0;
		for (const ws of sortedWorkstreams) {
			let maxHeight = 0;
			for (const m of ws.milestones) {
				const containerHeight = m.containerSize?.height || 0;
				console.log(`[PositioningV3] ${ws.name}/${m.entityId} containerSize: ${m.containerSize?.width}x${containerHeight}, children: ${m.children.length}`);
				maxHeight = Math.max(maxHeight, containerHeight);
			}
			ws.height = Math.max(maxHeight, this.config.nodeSizes.milestone.height);
			console.log(`[PositioningV3] Workstream ${ws.name} height: ${ws.height} (max container: ${maxHeight})`);
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
							console.log(`[PositioningV3] Cross-WS dep: ${depId} (${depNode.workstream}) -> ${m.entityId} (${m.workstream}) [depends_on]`);
						}
					}
				}
				// Check blocks for cross-workstream deps
				for (const blockedId of m.data.blocks) {
					if (allMilestoneIds.has(blockedId)) {
						const blockedNode = this.processedNodes.get(blockedId);
						if (blockedNode && blockedNode.workstream !== m.workstream) {
							crossWsDeps.push({ source: m.entityId, target: blockedId });
							console.log(`[PositioningV3] Cross-WS dep: ${m.entityId} (${m.workstream}) -> ${blockedId} (${blockedNode.workstream}) [blocks]`);
						}
					}
				}
			}
		}
		console.log(`[PositioningV3] Total cross-workstream deps: ${crossWsDeps.length}`);

		// Position milestones with constraint propagation
		// Each milestone's X is: max(previous in workstream, all cross-ws dependencies)
		const milestoneX = new Map<string, number>(); // entityId -> container start X
		const milestoneEndX = new Map<string, number>(); // entityId -> container end X (for intra-ws)
		const milestoneNodeEndX = new Map<string, number>(); // entityId -> node end X (for cross-ws)

		// Initialize all milestones with X=0
		for (const ws of sortedWorkstreams) {
			for (const m of ws.milestones) {
				const containerWidth = m.containerSize?.width || this.config.nodeSizes.milestone.width;
				const nodeWidth = this.config.nodeSizes.milestone.width;
				milestoneX.set(m.entityId, 0);
				milestoneEndX.set(m.entityId, containerWidth);
				// Node is at the RIGHT of container, so node end = container end
				milestoneNodeEndX.set(m.entityId, containerWidth);
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
					const nodeWidth = this.config.nodeSizes.milestone.width;

					// Constraint 1: Must be after previous milestone in same workstream (use container end)
					let minX = 0;
					if (i > 0) {
						const prevMilestone = sortedMilestones[i - 1];
						const prevEndX = milestoneEndX.get(prevMilestone.entityId) || 0;
						minX = prevEndX + this.config.containerGap;
					}

					// Constraint 2: Must be after all cross-workstream dependencies (use NODE end, not container)
					for (const dep of crossWsDeps) {
						if (dep.target === milestone.entityId) {
							const sourceNodeEndX = milestoneNodeEndX.get(dep.source) || 0;
							const newMinX = sourceNodeEndX + this.config.containerGap;
							if (newMinX > minX) {
								console.log(`[PositioningV3] ${milestone.entityId} constrained by cross-ws dep ${dep.source}: minX ${minX} -> ${newMinX}`);
								minX = newMinX;
							}
						}
					}

					const oldX = milestoneX.get(milestone.entityId) || 0;
					if (minX > oldX) {
						milestoneX.set(milestone.entityId, minX);
						milestoneEndX.set(milestone.entityId, minX + containerWidth);
						// Node is at RIGHT of container: nodeEndX = containerStartX + containerWidth
						milestoneNodeEndX.set(milestone.entityId, minX + containerWidth);
						changed = true;
						console.log(`[PositioningV3] ${milestone.entityId} X updated: ${oldX} -> ${minX} (nodeEndX: ${minX + containerWidth})`);
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

				// Milestone node is at the RIGHT of its container and BOTTOM of the workstream band
				// (children are positioned ABOVE the milestone)
				milestone.position = {
					x: containerX + containerSize.width - nodeSize.width,
					y: currentY + ws.height - nodeSize.height,
					width: nodeSize.width,
					height: nodeSize.height,
				};
			}

			currentY += ws.height + this.config.workstreamGap;
		}

		console.log(`[PositioningV3] Positioned ${sortedWorkstreams.length} workstreams with cross-workstream alignment`);
	}

	/**
	 * Order workstreams to minimize cross-workstream edge lengths.
	 * Workstreams with more dependencies between them should be placed adjacent.
	 *
	 * Algorithm:
	 * 1. Build a weighted graph where edge weight = number of cross-ws dependencies
	 * 2. Use greedy approach: start with workstream that has most total dependencies
	 * 3. Repeatedly add the workstream with most dependencies to already-placed workstreams
	 */
	private orderWorkstreamsByDependencyDensity(workstreams: WorkstreamData[]): WorkstreamData[] {
		if (workstreams.length <= 2) {
			// With 2 or fewer workstreams, order doesn't matter much
			return workstreams.sort((a, b) => a.name.localeCompare(b.name));
		}

		// Build cross-workstream dependency count matrix
		const depCount = new Map<string, Map<string, number>>();
		for (const ws of workstreams) {
			depCount.set(ws.name, new Map());
			for (const other of workstreams) {
				if (ws.name !== other.name) {
					depCount.get(ws.name)!.set(other.name, 0);
				}
			}
		}

		// Count dependencies between workstreams
		for (const ws of workstreams) {
			for (const m of ws.milestones) {
				// Count depends_on relationships
				for (const depId of m.data.dependsOn) {
					const depNode = this.processedNodes.get(depId);
					if (depNode && depNode.workstream !== ws.name) {
						const otherWs = depNode.workstream;
						if (depCount.get(ws.name)?.has(otherWs)) {
							depCount.get(ws.name)!.set(otherWs, depCount.get(ws.name)!.get(otherWs)! + 1);
							depCount.get(otherWs)!.set(ws.name, depCount.get(otherWs)!.get(ws.name)! + 1);
						}
					}
				}
				// Count blocks relationships
				for (const blockedId of m.data.blocks) {
					const blockedNode = this.processedNodes.get(blockedId);
					if (blockedNode && blockedNode.workstream !== ws.name) {
						const otherWs = blockedNode.workstream;
						if (depCount.get(ws.name)?.has(otherWs)) {
							depCount.get(ws.name)!.set(otherWs, depCount.get(ws.name)!.get(otherWs)! + 1);
							depCount.get(otherWs)!.set(ws.name, depCount.get(otherWs)!.get(ws.name)! + 1);
						}
					}
				}
			}
		}

		// Log dependency counts
		console.log(`[PositioningV3] Cross-workstream dependency counts:`);
		for (const [ws1, counts] of depCount) {
			for (const [ws2, count] of counts) {
				if (count > 0 && ws1 < ws2) {
					console.log(`[PositioningV3]   ${ws1} <-> ${ws2}: ${count}`);
				}
			}
		}

		// Calculate total dependencies for each workstream
		const totalDeps = new Map<string, number>();
		for (const ws of workstreams) {
			let total = 0;
			for (const count of depCount.get(ws.name)!.values()) {
				total += count;
			}
			totalDeps.set(ws.name, total);
		}

		// Greedy ordering: start with workstream that has most dependencies
		const ordered: WorkstreamData[] = [];
		const remaining = new Set(workstreams.map(ws => ws.name));

		// Find workstream with most total dependencies
		let maxDeps = -1;
		let startWs = '';
		for (const ws of workstreams) {
			const deps = totalDeps.get(ws.name)!;
			if (deps > maxDeps) {
				maxDeps = deps;
				startWs = ws.name;
			}
		}

		// If no dependencies, fall back to alphabetical
		if (maxDeps === 0) {
			console.log(`[PositioningV3] No cross-workstream dependencies, using alphabetical order`);
			return workstreams.sort((a, b) => a.name.localeCompare(b.name));
		}

		// Add first workstream
		ordered.push(workstreams.find(ws => ws.name === startWs)!);
		remaining.delete(startWs);

		// Greedily add remaining workstreams
		while (remaining.size > 0) {
			// Find workstream with most dependencies to already-placed workstreams
			let bestWs = '';
			let bestScore = -1;

			for (const wsName of remaining) {
				let score = 0;
				for (const placedWs of ordered) {
					score += depCount.get(wsName)!.get(placedWs.name) || 0;
				}
				if (score > bestScore) {
					bestScore = score;
					bestWs = wsName;
				}
			}

			// If tie or no dependencies, use alphabetical
			if (bestWs === '') {
				bestWs = Array.from(remaining).sort()[0];
			}

			ordered.push(workstreams.find(ws => ws.name === bestWs)!);
			remaining.delete(bestWs);
		}

		console.log(`[PositioningV3] Workstream order by dependency density: ${ordered.map(ws => ws.name).join(' -> ')}`);
		return ordered;
	}

	/**
	 * Sort milestones considering both intra-workstream and transitive cross-workstream dependencies.
	 * If A depends on B (cross-ws), and B depends on C (same ws as A), then A must come after C.
	 */
	private sortMilestonesByIntraWorkstreamDeps(milestones: ProcessedNode[]): ProcessedNode[] {
		if (milestones.length <= 1) return milestones;

		const milestoneIds = new Set(milestones.map(m => m.entityId));
		const workstream = milestones[0]?.workstream;

		// Build adjacency list
		const graph = new Map<string, Set<string>>();
		const inDegree = new Map<string, number>();

		for (const m of milestones) {
			graph.set(m.entityId, new Set());
			inDegree.set(m.entityId, 0);
		}

		// Direct intra-workstream dependencies
		// Note: blocks and depends_on can create the same edge (bidirectional relationships)
		// We must check if edge exists before incrementing in-degree to avoid double-counting
		for (const m of milestones) {
			// If A blocks B (same workstream), A is LEFT of B
			for (const blockedId of m.data.blocks) {
				if (milestoneIds.has(blockedId)) {
					if (!graph.get(m.entityId)!.has(blockedId)) {
						graph.get(m.entityId)!.add(blockedId);
						inDegree.set(blockedId, (inDegree.get(blockedId) || 0) + 1);
					}
				}
			}

			// If A depends_on B (same workstream), B is LEFT of A
			for (const depId of m.data.dependsOn) {
				if (milestoneIds.has(depId)) {
					if (!graph.get(depId)!.has(m.entityId)) {
						graph.get(depId)!.add(m.entityId);
						inDegree.set(m.entityId, (inDegree.get(m.entityId) || 0) + 1);
					}
				}
			}
		}

		// Add transitive cross-workstream dependencies
		// If A (this ws) depends on X (other ws), and X depends on B (this ws), then A must come after B
		for (const m of milestones) {
			const transitiveDeps = this.getTransitiveDepsInWorkstream(m.entityId, workstream, milestoneIds);
			if (transitiveDeps.size > 0) {
				console.log(`[PositioningV3] ${m.entityId} transitive deps in ${workstream}: ${Array.from(transitiveDeps).join(', ')}`);
			}
			for (const depId of transitiveDeps) {
				if (depId !== m.entityId && !graph.get(depId)?.has(m.entityId)) {
					graph.get(depId)!.add(m.entityId);
					inDegree.set(m.entityId, (inDegree.get(m.entityId) || 0) + 1);
					console.log(`[PositioningV3] Added edge: ${depId} -> ${m.entityId} (transitive)`);
				}
			}
		}

		// Debug: log all edges and in-degrees
		console.log(`[PositioningV3] ${workstream} graph edges:`);
		for (const [from, tos] of graph) {
			if (tos.size > 0) {
				console.log(`[PositioningV3]   ${from} -> ${Array.from(tos).join(', ')}`);
			}
		}
		console.log(`[PositioningV3] ${workstream} in-degrees:`);
		for (const [id, degree] of inDegree) {
			console.log(`[PositioningV3]   ${id}: ${degree}`);
		}

		// Topological sort
		const queue: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) queue.push(id);
		}
		queue.sort();
		console.log(`[PositioningV3] ${workstream} initial queue (in-degree 0): ${queue.join(', ')}`);

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
			console.log(`[PositioningV3] WARNING: ${remaining.length} milestones in cycle, added alphabetically: ${remaining.map(m => m.entityId).join(', ')}`);
			// Debug: show remaining in-degrees
			for (const m of remaining) {
				console.log(`[PositioningV3]   ${m.entityId} final in-degree: ${inDegree.get(m.entityId)}`);
			}
		}

		console.log(`[PositioningV3] Sorted ${workstream} milestones: ${sorted.map(m => m.entityId).join(' -> ')}`);
		return sorted;
	}

	/**
	 * Find all milestones in the target workstream that this milestone transitively depends on
	 * via cross-workstream dependencies.
	 *
	 * Example: If M-026 (eng) depends on M-001 (infra), and M-001 depends on M-039 (eng),
	 * then M-026 transitively depends on M-039 within the engineering workstream.
	 *
	 * This function only returns dependencies reached via cross-workstream paths.
	 * Direct same-workstream dependencies are handled separately.
	 */
	private getTransitiveDepsInWorkstream(
		entityId: string,
		targetWorkstream: string,
		targetMilestoneIds: Set<string>,
		visited: Set<string> = new Set(),
		crossedWorkstream: boolean = false  // Track if we've crossed into another workstream
	): Set<string> {
		const result = new Set<string>();

		if (visited.has(entityId)) return result;
		visited.add(entityId);

		const node = this.processedNodes.get(entityId);
		if (!node) return result;

		// Check all dependencies
		for (const depId of node.data.dependsOn) {
			const depNode = this.processedNodes.get(depId);
			if (!depNode) continue;

			if (depNode.workstream === targetWorkstream && targetMilestoneIds.has(depId)) {
				// Dependency in target workstream - only add if we've crossed workstreams
				if (crossedWorkstream) {
					result.add(depId);
				}
				// Don't recurse into same-workstream deps - they're handled by direct processing
			} else if (depNode.workstream !== targetWorkstream) {
				// Cross-workstream dependency - recurse with crossedWorkstream=true
				const transitive = this.getTransitiveDepsInWorkstream(
					depId, targetWorkstream, targetMilestoneIds, visited, true
				);
				for (const id of transitive) {
					result.add(id);
				}
			}
		}

		// Also check blocks (reverse direction)
		for (const blockedId of node.data.blocks) {
			const blockedNode = this.processedNodes.get(blockedId);
			if (!blockedNode) continue;

			// If this node blocks something in another workstream, that blocked thing's deps
			// in our workstream should come before us
			if (blockedNode.workstream !== targetWorkstream) {
				const transitive = this.getTransitiveDepsInWorkstream(
					blockedId, targetWorkstream, targetMilestoneIds, visited, true
				);
				for (const id of transitive) {
					result.add(id);
				}
			}
		}

		return result;
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

		// Check if siblings have dependencies - use dependency-aware grid if so
		const hasDeps = this.hasSiblingDependencies(parent.children);

		if (hasDeps) {
			// Dependency-aware grid layout: use level assignments from calculateContainerSize
			const levelAssignments = (parent as any)._levelAssignments as { child: ProcessedNode; level: number }[];
			const colWidths = (parent as any)._colWidths as number[];
			const gridHeight = (parent as any)._gridHeight as number;

			if (!levelAssignments || !colWidths) {
				// Fallback: recalculate
				console.warn(`[PositioningV3] Missing level assignments for ${parent.entityId}, recalculating`);
				return;
			}

			// Group by level
			const levelGroups = new Map<number, ProcessedNode[]>();
			for (const { child, level } of levelAssignments) {
				if (!levelGroups.has(level)) {
					levelGroups.set(level, []);
				}
				levelGroups.get(level)!.push(child);
			}

			// Calculate grid dimensions
			const gridWidth = colWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, colWidths.length - 1) * this.config.childGap;

			// Grid starts LEFT of parent, ABOVE parent
			const gridStartX = parentPos.x - this.config.childGap - gridWidth;
			const gridStartY = parentPos.y - this.config.childGap - gridHeight;

			// Position each child by level (column) and row within level
			for (const { child, level } of levelAssignments) {
				const childNodeSize = this.config.nodeSizes[child.type];
				const childContainerSize = child.containerSize!;

				// Calculate X position (sum of previous column widths + gaps)
				// Right-align within column: add offset for smaller containers
				let colStartX = gridStartX;
				for (let c = 0; c < level; c++) {
					colStartX += colWidths[c] + this.config.childGap;
				}
				// Right-align: shift by difference between column width and container width
				const childX = colStartX + (colWidths[level] - childContainerSize.width);

				// Calculate Y position within the column
				const siblings = levelGroups.get(level)!;
				const indexInColumn = siblings.indexOf(child);
				let childY = gridStartY;
				for (let i = 0; i < indexInColumn; i++) {
					childY += siblings[i].containerSize!.height + this.config.childGap;
				}

				// Child's node is at the RIGHT of its container and BOTTOM of its row
				child.position = {
					x: childX + childContainerSize.width - childNodeSize.width,
					y: childY + childContainerSize.height - childNodeSize.height,
					width: childNodeSize.width,
					height: childNodeSize.height,
				};

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
				const childNodeSize = this.config.nodeSizes[child.type];
				const childContainerSize = child.containerSize!;

				// Calculate X position (sum of previous column widths + gaps)
				// Right-align within column: add offset for smaller containers
				let colStartX = gridStartX;
				for (let c = 0; c < col; c++) {
					colStartX += colWidths[c] + this.config.childGap;
				}
				// Right-align: shift by difference between column width and container width
				const childX = colStartX + (colWidths[col] - childContainerSize.width);

				// Calculate Y position (sum of previous row heights + gaps)
				let childY = gridStartY;
				for (let r = 0; r < row; r++) {
					childY += rowHeights[r] + this.config.childGap;
				}

				// Child's node is at the RIGHT of its container and BOTTOM of the row
				// (grandchildren are positioned ABOVE the child node)
				child.position = {
					x: childX + childContainerSize.width - childNodeSize.width,
					y: childY + rowHeights[row] - childNodeSize.height,  // Bottom of row
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
		// Get container bounds for each parent (not just node position)
		const containerBounds: { minX: number; maxX: number; minY: number }[] = [];

		for (const parentId of mpe.parentEntityIds) {
			const parent = this.processedNodes.get(parentId);
			if (parent?.position && parent.containerSize) {
				// Container extends LEFT and ABOVE the node
				// Node is at bottom-right of container
				const containerMinX = parent.position.x + parent.position.width - parent.containerSize.width;
				const containerMaxX = parent.position.x + parent.position.width;
				const containerMinY = parent.position.y + parent.position.height - parent.containerSize.height;
				containerBounds.push({ minX: containerMinX, maxX: containerMaxX, minY: containerMinY });
			} else if (parent?.position) {
				// No container size, use node position
				containerBounds.push({
					minX: parent.position.x,
					maxX: parent.position.x + parent.position.width,
					minY: parent.position.y
				});
			}
		}

		if (containerBounds.length === 0) {
			// No positioned parents, treat as orphan
			this.orphanedEntities.push(mpe.node);
			return;
		}

		// Calculate bounding box of all parent containers
		const minX = Math.min(...containerBounds.map(b => b.minX));
		const maxX = Math.max(...containerBounds.map(b => b.maxX));
		const minY = Math.min(...containerBounds.map(b => b.minY));

		const nodeSize = this.config.nodeSizes[mpe.node.type];

		// Position centered horizontally above the combined container bounds
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

				// Center horizontally between parent containers (not just nodes)
				const containerBounds: { minX: number; maxX: number }[] = [];
				for (const parentId of mpe.parentEntityIds) {
					const parent = this.processedNodes.get(parentId);
					if (parent?.position && parent.containerSize) {
						// Container extends LEFT of the node
						const containerMinX = parent.position.x + parent.position.width - parent.containerSize.width;
						const containerMaxX = parent.position.x + parent.position.width;
						containerBounds.push({ minX: containerMinX, maxX: containerMaxX });
					} else if (parent?.position) {
						containerBounds.push({
							minX: parent.position.x,
							maxX: parent.position.x + parent.position.width
						});
					}
				}

				let x = currentX;
				if (containerBounds.length > 0) {
					const minX = Math.min(...containerBounds.map(b => b.minX));
					const maxX = Math.max(...containerBounds.map(b => b.maxX));
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

		// Separate orphans with children (dependency chains) from simple orphans
		const orphansWithChildren = this.orphanedEntities.filter(o => o.children.length > 0);
		const simpleOrphans = this.orphanedEntities.filter(o => o.children.length === 0);

		console.log(`[PositioningV3] Orphans with children (dependency chains): ${orphansWithChildren.map(o => o.entityId).join(', ') || 'none'}`);
		console.log(`[PositioningV3] Simple orphans: ${simpleOrphans.length}`);

		// Position orphans with children first - they need more space
		let currentX = 0;
		const startY = maxY + this.config.orphanGap;

		for (const orphan of orphansWithChildren) {
			// Use container size which includes children
			const containerSize = orphan.containerSize || this.config.nodeSizes[orphan.type];

			orphan.position = {
				x: currentX,
				y: startY,
				width: this.config.nodeSizes[orphan.type].width,
				height: this.config.nodeSizes[orphan.type].height,
			};

			// Position children recursively
			this.positionChildrenRecursive(orphan);

			// Move X for next orphan chain, using full container width
			currentX += containerSize.width + this.config.containerGap;
		}

		// Position simple orphans in a grid after the dependency chains
		if (simpleOrphans.length > 0) {
			const grid = this.calculateOptimalGrid(simpleOrphans);
			const simpleStartX = currentX > 0 ? currentX : 0;
			const simpleStartY = startY;

			// Calculate max dimensions for uniform grid cells
			let maxWidth = 0;
			let maxHeight = 0;
			for (const orphan of simpleOrphans) {
				const size = this.config.nodeSizes[orphan.type];
				maxWidth = Math.max(maxWidth, size.width);
				maxHeight = Math.max(maxHeight, size.height);
			}

			for (let i = 0; i < simpleOrphans.length; i++) {
				const orphan = simpleOrphans[i];
				const col = i % grid.columns;
				const row = Math.floor(i / grid.columns);
				const nodeSize = this.config.nodeSizes[orphan.type];

				orphan.position = {
					x: simpleStartX + col * (maxWidth + this.config.childGap),
					y: simpleStartY + row * (maxHeight + this.config.childGap),
					width: nodeSize.width,
					height: nodeSize.height,
				};
			}
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
