/**
 * Canvas Node Positioning Algorithm V4
 * 
 * Ruleset-based hierarchical container layout with workstream lanes.
 * Children positioned LEFT and ABOVE their parents.
 * 
 * Key changes from V3:
 * - Declarative relationship rules instead of hardcoded per-entity logic
 * - Entity categories: Contained, Floating, Orphan
 * - Priority-based containment conflict resolution
 * - Cross-workstream positioning for Stories (not just Milestones)
 * - Floating entities positioned on top of workstreams
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
	floatingGap: number;        // Gap between floating area and workstream top
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
	floatingGap: 100,
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
	enables: string[];        // Deprecated - auto-migrated to affects
	affects: string[];        // New field for Decision
	implementedBy: string[];
	implements: string[];
	documents?: string;       // Document -> Feature relationship
	supersedes?: string;      // Decision -> Decision relationship
	previousVersion?: string; // Document -> Document relationship
	filePath: string;
}

// ============================================================================
// Relationship Ruleset
// ============================================================================

type RelationshipAction = 'containment' | 'sequencing';
type ContainmentDirection = 'child' | 'parent';
type SequencingDirection = 'before' | 'after';

export interface RelationshipRule {
	sourceType: EntityType;
	field: string;
	targetType: EntityType | EntityType[] | 'workstream';
	action: RelationshipAction;
	direction: ContainmentDirection | SequencingDirection;
	priority?: number;           // For containment conflicts (lower wins)
	crossWsPositioning?: boolean; // If true, apply cross-workstream position constraints
}

export const RELATIONSHIP_RULES: RelationshipRule[] = [
	// MILESTONE
	{ sourceType: 'milestone', field: 'workstream', targetType: 'workstream', action: 'containment', direction: 'child' },
	{ sourceType: 'milestone', field: 'depends_on', targetType: 'milestone', action: 'sequencing', direction: 'after', crossWsPositioning: true },
	{ sourceType: 'milestone', field: 'blocks', targetType: 'milestone', action: 'sequencing', direction: 'before', crossWsPositioning: true },
	{ sourceType: 'milestone', field: 'implements', targetType: ['feature', 'document'], action: 'containment', direction: 'parent' },

	// STORY
	{ sourceType: 'story', field: 'parent', targetType: 'milestone', action: 'containment', direction: 'child' },
	{ sourceType: 'story', field: 'depends_on', targetType: 'story', action: 'sequencing', direction: 'after', crossWsPositioning: true },
	{ sourceType: 'story', field: 'blocks', targetType: 'story', action: 'sequencing', direction: 'before', crossWsPositioning: true },
	{ sourceType: 'story', field: 'implements', targetType: ['feature', 'document'], action: 'containment', direction: 'parent' },

	// TASK (crossWsPositioning: false - edge only, no position constraint)
	{ sourceType: 'task', field: 'parent', targetType: 'story', action: 'containment', direction: 'child' },
	{ sourceType: 'task', field: 'depends_on', targetType: 'task', action: 'sequencing', direction: 'after', crossWsPositioning: false },
	{ sourceType: 'task', field: 'blocks', targetType: 'task', action: 'sequencing', direction: 'before', crossWsPositioning: false },

	// DECISION
	{ sourceType: 'decision', field: 'parent', targetType: ['milestone', 'story'], action: 'containment', direction: 'child', priority: 1 },
	{ sourceType: 'decision', field: 'affects', targetType: ['milestone', 'story', 'task', 'document'], action: 'containment', direction: 'child', priority: 2 },
	{ sourceType: 'decision', field: 'affects', targetType: 'decision', action: 'sequencing', direction: 'before', crossWsPositioning: false },
	{ sourceType: 'decision', field: 'supersedes', targetType: 'decision', action: 'sequencing', direction: 'before' },
	{ sourceType: 'decision', field: 'depends_on', targetType: 'decision', action: 'sequencing', direction: 'after', crossWsPositioning: false },
	{ sourceType: 'decision', field: 'blocks', targetType: 'decision', action: 'sequencing', direction: 'before', crossWsPositioning: false },

	// DOCUMENT
	{ sourceType: 'document', field: 'parent', targetType: ['milestone', 'story'], action: 'containment', direction: 'child', priority: 1 },
	{ sourceType: 'document', field: 'implemented_by', targetType: ['milestone', 'story', 'task'], action: 'containment', direction: 'child', priority: 2 },
	{ sourceType: 'document', field: 'documents', targetType: 'feature', action: 'containment', direction: 'child', priority: 3 },
	{ sourceType: 'document', field: 'previous_version', targetType: 'document', action: 'sequencing', direction: 'after' },

	// FEATURE
	{ sourceType: 'feature', field: 'parent', targetType: ['milestone', 'story'], action: 'containment', direction: 'child', priority: 1 },
	{ sourceType: 'feature', field: 'implemented_by', targetType: ['milestone', 'story', 'task'], action: 'containment', direction: 'child', priority: 2 },
];

// ============================================================================
// Entity Categories
// ============================================================================

export type EntityCategory = 'contained' | 'floating-single-ws' | 'floating-multi-ws' | 'orphan';

// ============================================================================
// Internal Types
// ============================================================================

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

/** Processed relationship from ruleset */
interface ProcessedRelationship {
	targetEntityId: string;
	action: RelationshipAction;
	direction: ContainmentDirection | SequencingDirection;
	priority?: number;
	crossWsPositioning?: boolean;
	field: string;  // Source field name for debugging
}

/** Internal node representation during processing */
interface ProcessedNode {
	entityId: string;
	nodeId: string;
	type: EntityType;
	workstream: string;
	data: EntityData;
	category: EntityCategory;
	// Containment
	containmentParentId?: string;      // Single parent after priority resolution
	containmentEdgeTargets: string[];  // Additional containment targets (edge only)
	children: ProcessedNode[];
	// Sequencing
	sequencingBefore: string[];        // Entities this comes BEFORE
	sequencingAfter: string[];         // Entities this comes AFTER
	// Positioning
	containerSize?: ContainerSize;
	position?: NodePosition;
	relativeOffset?: { x: number; y: number };
}

/** Workstream with its milestones */
interface WorkstreamData {
	name: string;
	milestones: ProcessedNode[];
	floatingEntities: ProcessedNode[];  // Floating entities for this workstream
	baseY: number;
	height: number;
}

/** Multi-parent entity waiting for deferred positioning */
interface DeferredEntity {
	node: ProcessedNode;
	parentEntityIds: string[];
	parentWorkstreams: Set<string>;
}

/** Floating entity with sequencing targets */
interface FloatingEntity {
	node: ProcessedNode;
	sequencingTargetIds: string[];
	targetWorkstreams: Set<string>;
}

/** Cross-workstream band for floating/deferred entities */
interface CrossWorkstreamBand {
	workstreams: [string, string];
	entities: ProcessedNode[];
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

export class PositioningEngineV4 {
	private config: PositioningConfig;

	// Phase 1: Index
	private entityMap: Map<string, EntityData> = new Map();        // entityId -> data
	private nodeIdToEntityId: Map<string, string> = new Map();     // nodeId -> entityId
	private entityIdToNodeId: Map<string, string> = new Map();     // entityId -> nodeId
	private processedNodes: Map<string, ProcessedNode> = new Map(); // entityId -> node

	// Phase 2-3: Relationships and Categories
	private containedEntities: ProcessedNode[] = [];
	private floatingSingleWs: FloatingEntity[] = [];
	private floatingMultiWs: FloatingEntity[] = [];
	private orphanedEntities: ProcessedNode[] = [];
	private deferredEntities: DeferredEntity[] = [];

	// Phase 5-6: Workstreams
	private workstreams: Map<string, WorkstreamData> = new Map();
	private crossWorkstreamBands: CrossWorkstreamBand[] = [];

	// Results
	private errors: string[] = [];
	private warnings: string[] = [];

	constructor(config: Partial<PositioningConfig> = {}) {
		this.config = { ...DEFAULT_POSITIONING_CONFIG, ...config };
	}

	/**
	 * Main entry point: calculate positions for all nodes
	 */
	public calculatePositions(entities: EntityData[]): PositioningResult {
		console.log(`[PositioningV4] Starting positioning for ${entities.length} entities`);

		// Reset state
		this.resetState();

		// Phase 1: Index all entities
		this.indexEntities(entities);

		// Phase 2: Process relationships via ruleset
		this.processRelationships();

		// Phase 3: Categorize entities
		this.categorizeEntities();

		// Phase 3.5: Infer containment from dependents for orphan stories
		this.inferContainmentFromDependents();

		// Phase 4: Detect circular dependencies
		this.detectCircularDependencies();

		// Phase 5: Calculate container sizes (bottom-up)
		this.calculateAllContainerSizes();

		// Phase 6: Position workstreams and milestones
		this.positionWorkstreams();

		// Phase 7: Position stories with cross-workstream constraints
		this.positionStoriesWithCrossWsConstraints();

		// Phase 8: Position children within containers
		this.positionAllChildren();

		// Phase 9: Position floating entities
		this.positionFloatingEntities();

		// Phase 10: Position orphans
		this.positionOrphans();

		// Phase 11: Resolve overlaps
		this.resolveOverlaps();

		return this.collectResults();
	}

	private resetState(): void {
		this.entityMap.clear();
		this.nodeIdToEntityId.clear();
		this.entityIdToNodeId.clear();
		this.processedNodes.clear();
		this.containedEntities = [];
		this.floatingSingleWs = [];
		this.floatingMultiWs = [];
		this.orphanedEntities = [];
		this.deferredEntities = [];
		this.workstreams.clear();
		this.crossWorkstreamBands = [];
		this.errors = [];
		this.warnings = [];
	}

	// ========================================================================
	// Phase 1: Index Entities
	// ========================================================================

	private indexEntities(entities: EntityData[]): void {
		console.log(`[PositioningV4] Phase 1: Indexing ${entities.length} entities`);

		for (const entity of entities) {
			// Validate required fields
			if (!entity.entityId || !entity.nodeId || !entity.type) {
				this.errors.push(`Invalid entity: missing required fields - ${JSON.stringify(entity)}`);
				continue;
			}

			// Auto-migrate enables/blocks to affects for Decision entities
			if (entity.type === 'decision') {
				this.migrateDecisionFields(entity);
			}

			// Clean self-references
			this.cleanSelfReferences(entity);

			// Build maps
			this.entityMap.set(entity.entityId, entity);
			this.nodeIdToEntityId.set(entity.nodeId, entity.entityId);
			this.entityIdToNodeId.set(entity.entityId, entity.nodeId);

			// Create ProcessedNode
			const node: ProcessedNode = {
				entityId: entity.entityId,
				nodeId: entity.nodeId,
				type: entity.type,
				workstream: entity.workstream || '',
				data: entity,
				category: 'orphan',  // Default, will be updated in Phase 3
				containmentEdgeTargets: [],
				children: [],
				sequencingBefore: [],
				sequencingAfter: [],
			};

			this.processedNodes.set(entity.entityId, node);
		}

		console.log(`[PositioningV4] Indexed ${this.processedNodes.size} valid entities`);
	}

	/**
	 * Auto-migrate deprecated enables/blocks fields to affects for Decision entities.
	 * Note: blocks to OTHER decisions should remain as sequencing, not be migrated to affects.
	 */
	private migrateDecisionFields(entity: EntityData): void {
		const migrated: string[] = [];

		// Migrate enables -> affects
		if (entity.enables && entity.enables.length > 0) {
			migrated.push(...entity.enables);
			this.warnings.push(`Decision ${entity.entityId}: migrated 'enables' to 'affects'`);
		}

		// Migrate blocks -> affects ONLY for non-decision targets
		// blocks to other decisions should remain as sequencing relationships
		if (entity.blocks && entity.blocks.length > 0) {
			const blocksToDecisions: string[] = [];
			const blocksToOthers: string[] = [];

			for (const targetId of entity.blocks) {
				// Check if target is a decision (starts with DEC-)
				if (targetId.startsWith('DEC-')) {
					blocksToDecisions.push(targetId);
				} else {
					blocksToOthers.push(targetId);
				}
			}

			// Migrate non-decision blocks to affects
			if (blocksToOthers.length > 0) {
				migrated.push(...blocksToOthers);
				this.warnings.push(`Decision ${entity.entityId}: migrated 'blocks' to 'affects' for non-decision targets`);
			}

			// Keep decision-to-decision blocks for sequencing
			entity.blocks = blocksToDecisions;
		}

		// Merge with existing affects
		if (!entity.affects) {
			entity.affects = [];
		}
		entity.affects = [...new Set([...entity.affects, ...migrated])];
	}

	/**
	 * Remove self-references from relationship arrays
	 */
	private cleanSelfReferences(entity: EntityData): void {
		const selfId = entity.entityId;

		if (entity.dependsOn) {
			entity.dependsOn = entity.dependsOn.filter(id => id !== selfId);
		}
		if (entity.blocks) {
			entity.blocks = entity.blocks.filter(id => id !== selfId);
		}
		if (entity.affects) {
			entity.affects = entity.affects.filter(id => id !== selfId);
		}
		if (entity.implementedBy) {
			entity.implementedBy = entity.implementedBy.filter(id => id !== selfId);
		}
		if (entity.implements) {
			entity.implements = entity.implements.filter(id => id !== selfId);
		}
		if (entity.parent === selfId) {
			entity.parent = undefined;
		}
		if (entity.supersedes === selfId) {
			entity.supersedes = undefined;
		}
		if (entity.previousVersion === selfId) {
			entity.previousVersion = undefined;
		}
		if (entity.documents === selfId) {
			entity.documents = undefined;
		}
	}

	// ========================================================================
	// Phase 2: Process Relationships via Ruleset
	// ========================================================================

	private processRelationships(): void {
		console.log(`[PositioningV4] Phase 2: Processing relationships via ruleset`);

		for (const node of this.processedNodes.values()) {
			const relationships = this.extractRelationships(node);

			// Separate containment and sequencing relationships
			const containmentRels = relationships.filter(r => r.action === 'containment');
			const sequencingRels = relationships.filter(r => r.action === 'sequencing');

			// Process containment with priority resolution
			this.processContainmentRelationships(node, containmentRels);

			// Process sequencing relationships
			this.processSequencingRelationships(node, sequencingRels);
		}
	}

	/**
	 * Extract all relationships for an entity based on the ruleset
	 */
	private extractRelationships(node: ProcessedNode): ProcessedRelationship[] {
		const relationships: ProcessedRelationship[] = [];
		const entity = node.data;

		// Debug logging for specific entities
		const isDebugEntity = entity.entityId === 'DOC-028' || entity.entityId === 'S-042';
		if (isDebugEntity) {
			console.log(`[PositioningV4] DEBUG ${entity.entityId}: type=${entity.type}, implementedBy=${JSON.stringify((entity as any).implementedBy)}, implements=${JSON.stringify((entity as any).implements)}, parent=${entity.parent}`);
		}

		// Find applicable rules for this entity type
		const applicableRules = RELATIONSHIP_RULES.filter(r => r.sourceType === entity.type);

		for (const rule of applicableRules) {
			const fieldValue = this.getFieldValue(entity, rule.field);
			if (!fieldValue) continue;

			// Handle array or single value
			const targetIds = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

			for (const targetId of targetIds) {
				if (!targetId || typeof targetId !== 'string') continue;

				// Validate target exists (except for workstream which is just a string)
				if (rule.targetType !== 'workstream' && !this.processedNodes.has(targetId)) {
					// Target doesn't exist on canvas - skip silently
					continue;
				}

				// Validate target type matches rule
				if (rule.targetType !== 'workstream') {
					const targetNode = this.processedNodes.get(targetId);
					if (targetNode) {
						const allowedTypes = Array.isArray(rule.targetType) ? rule.targetType : [rule.targetType];
						if (!allowedTypes.includes(targetNode.type)) {
							this.warnings.push(`${entity.entityId}: ${rule.field} target ${targetId} is ${targetNode.type}, expected ${allowedTypes.join('/')}`);
							continue;
						}
					}
				}

				relationships.push({
					targetEntityId: targetId,
					action: rule.action,
					direction: rule.direction,
					priority: rule.priority,
					crossWsPositioning: rule.crossWsPositioning,
					field: rule.field,
				});

				if (isDebugEntity) {
					console.log(`[PositioningV4] DEBUG ${entity.entityId}: matched rule field=${rule.field}, target=${targetId}, action=${rule.action}, direction=${rule.direction}`);
				}
			}
		}

		if (isDebugEntity) {
			console.log(`[PositioningV4] DEBUG ${entity.entityId}: total relationships=${relationships.length}`);
		}

		return relationships;
	}

	/**
	 * Get field value from entity, handling field name mapping
	 */
	private getFieldValue(entity: EntityData, fieldName: string): string | string[] | undefined {
		// Map ruleset field names to EntityData property names
		const fieldMap: Record<string, keyof EntityData> = {
			'depends_on': 'dependsOn',
			'implemented_by': 'implementedBy',
			'previous_version': 'previousVersion',
		};

		const mappedField = fieldMap[fieldName] || fieldName;
		return (entity as any)[mappedField];
	}

	/**
	 * Process containment relationships with priority resolution
	 */
	private processContainmentRelationships(node: ProcessedNode, relationships: ProcessedRelationship[]): void {
		if (relationships.length === 0) return;

		const isDebugEntity = node.entityId === 'DOC-028' || node.entityId === 'S-042';

		// Group by direction
		const childRels = relationships.filter(r => r.direction === 'child');
		const parentRels = relationships.filter(r => r.direction === 'parent');

		if (isDebugEntity) {
			console.log(`[PositioningV4] DEBUG processContainment ${node.entityId}: childRels=${childRels.length}, parentRels=${parentRels.length}`);
		}

		// Process "child" direction (this entity is child of target)
		if (childRels.length > 0) {
			// Sort by priority (lower wins)
			childRels.sort((a, b) => (a.priority || 999) - (b.priority || 999));

			// First one wins containment
			const winner = childRels[0];
			node.containmentParentId = winner.targetEntityId;

			if (isDebugEntity) {
				console.log(`[PositioningV4] DEBUG ${node.entityId}: set containmentParentId=${winner.targetEntityId} (field=${winner.field})`);
			}

			// Rest become edge-only targets
			for (let i = 1; i < childRels.length; i++) {
				node.containmentEdgeTargets.push(childRels[i].targetEntityId);
			}
		}

		// Process "parent" direction (this entity is parent of target)
		// This means target should be child of this entity
		for (const rel of parentRels) {
			const targetNode = this.processedNodes.get(rel.targetEntityId);
			if (targetNode) {
				const targetIsDebug = targetNode.entityId === 'DOC-028' || targetNode.entityId === 'S-042';
				// Only set if target doesn't already have a higher-priority parent
				if (!targetNode.containmentParentId) {
					targetNode.containmentParentId = node.entityId;
					if (isDebugEntity || targetIsDebug) {
						console.log(`[PositioningV4] DEBUG ${node.entityId} (parent direction): set ${targetNode.entityId}.containmentParentId=${node.entityId}`);
					}
				} else {
					// Target already has a parent, add as edge-only
					targetNode.containmentEdgeTargets.push(node.entityId);
					if (isDebugEntity || targetIsDebug) {
						console.log(`[PositioningV4] DEBUG ${node.entityId} (parent direction): ${targetNode.entityId} already has parent=${targetNode.containmentParentId}, adding edge-only`);
					}
				}
			}
		}
	}

	/**
	 * Process sequencing relationships
	 */
	private processSequencingRelationships(node: ProcessedNode, relationships: ProcessedRelationship[]): void {
		for (const rel of relationships) {
			if (rel.direction === 'before') {
				// This entity comes BEFORE target
				node.sequencingBefore.push(rel.targetEntityId);
			} else if (rel.direction === 'after') {
				// This entity comes AFTER target
				node.sequencingAfter.push(rel.targetEntityId);
			}
		}
	}

	// ========================================================================
	// Phase 3: Categorize Entities
	// ========================================================================

	private categorizeEntities(): void {
		console.log(`[PositioningV4] Phase 3: Categorizing entities`);

		for (const node of this.processedNodes.values()) {
			const hasContainment = !!node.containmentParentId || node.containmentEdgeTargets.length > 0;
			const hasSequencing = node.sequencingBefore.length > 0 || node.sequencingAfter.length > 0;

			// Special case: Milestone with workstream is contained
			const isMilestoneWithWorkstream = node.type === 'milestone' && node.workstream;

			if (hasContainment || isMilestoneWithWorkstream) {
				// Check for deferred (multiple containment parents at same priority)
				const multipleParents = this.hasMultipleContainmentParents(node);

				if (multipleParents) {
					node.category = 'contained';  // Will be handled as deferred
					this.deferredEntities.push({
						node,
						parentEntityIds: this.getAllContainmentParents(node),
						parentWorkstreams: this.getWorkstreamsForParents(this.getAllContainmentParents(node)),
					});
				} else {
					node.category = 'contained';
					this.containedEntities.push(node);

					// Attach to parent's children array
					if (node.containmentParentId) {
						const parent = this.processedNodes.get(node.containmentParentId);
						if (parent) {
							parent.children.push(node);
							// Debug logging
							if (node.entityId === 'DOC-028' || node.containmentParentId === 'S-042') {
								console.log(`[PositioningV4] DEBUG Phase 3: Added ${node.entityId} to ${parent.entityId}.children (now has ${parent.children.length} children)`);
							}
						}
					}
				}
			} else if (hasSequencing) {
				// Floating: has sequencing but no containment
				const targetWorkstreams = this.getWorkstreamsForSequencingTargets(node);

				if (targetWorkstreams.size === 0) {
					// Sequencing targets not found or have no workstream - treat as orphan
					node.category = 'orphan';
					this.orphanedEntities.push(node);
				} else if (targetWorkstreams.size === 1) {
					node.category = 'floating-single-ws';
					this.floatingSingleWs.push({
						node,
						sequencingTargetIds: [...node.sequencingBefore, ...node.sequencingAfter],
						targetWorkstreams,
					});
				} else {
					node.category = 'floating-multi-ws';
					this.floatingMultiWs.push({
						node,
						sequencingTargetIds: [...node.sequencingBefore, ...node.sequencingAfter],
						targetWorkstreams,
					});
				}
			} else {
				// Orphan: no relationships at all
				node.category = 'orphan';
				this.orphanedEntities.push(node);
			}
		}

		console.log(`[PositioningV4] Categories: contained=${this.containedEntities.length}, ` +
			`floating-single=${this.floatingSingleWs.length}, floating-multi=${this.floatingMultiWs.length}, ` +
			`deferred=${this.deferredEntities.length}, orphan=${this.orphanedEntities.length}`);
	}

	/**
	 * Check if entity has multiple containment parents that can't be resolved.
	 * If one parent is an ancestor of another, resolve to the most specific (deepest) one.
	 * Returns true only if there are truly conflicting parents (different hierarchies).
	 */
	private hasMultipleContainmentParents(node: ProcessedNode): boolean {
		const allParents = this.getAllContainmentParents(node);
		if (allParents.length <= 1) return false;

		// Try to resolve by finding the most specific parent (deepest in hierarchy)
		const resolvedParent = this.resolveParentConflict(allParents);
		if (resolvedParent) {
			// Resolved! Update node to use the most specific parent
			node.containmentParentId = resolvedParent;
			node.containmentEdgeTargets = allParents.filter(p => p !== resolvedParent);
			return false; // Not deferred - we resolved it
		}

		return true; // Truly conflicting parents
	}

	/**
	 * Try to resolve parent conflict.
	 * Priority:
	 * 1. If one parent is an ancestor of another, pick the most specific (deepest)
	 * 2. If all parents are milestones in the same workstream, pick the first one (leftmost)
	 * 3. Otherwise, can't resolve - truly conflicting
	 */
	private resolveParentConflict(parentIds: string[]): string | undefined {
		if (parentIds.length <= 1) return parentIds[0];

		// Strategy 1: Check if one parent is an ancestor of another
		// If A is ancestor of B, then B is more specific - pick B
		for (const candidateId of parentIds) {
			const candidate = this.processedNodes.get(candidateId);
			if (!candidate) continue;

			// Check if this candidate is an ancestor of any other parent
			let isAncestorOfAnother = false;
			for (const otherId of parentIds) {
				if (otherId === candidateId) continue;
				if (this.isAncestorOf(candidateId, otherId)) {
					isAncestorOfAnother = true;
					break;
				}
			}

			// If this candidate is NOT an ancestor of any other, it might be the most specific
			// But we need to verify it's a descendant of all others (or unrelated)
			if (!isAncestorOfAnother) {
				// Check if all other parents are ancestors of this candidate
				let allOthersAreAncestors = true;
				for (const otherId of parentIds) {
					if (otherId === candidateId) continue;
					if (!this.isAncestorOf(otherId, candidateId)) {
						allOthersAreAncestors = false;
						break;
					}
				}
				if (allOthersAreAncestors) {
					return candidateId; // This is the most specific
				}
			}
		}

		// Strategy 2: If all parents are milestones in the same workstream, pick the first one
		const parentNodes = parentIds.map(id => this.processedNodes.get(id)).filter(Boolean) as ProcessedNode[];
		const allMilestones = parentNodes.every(n => n.type === 'milestone');

		if (allMilestones && parentNodes.length > 0) {
			const workstreams = new Set(parentNodes.map(n => n.workstream).filter(Boolean));

			if (workstreams.size === 1) {
				// All milestones in same workstream - pick the one with lowest sequence number
				// Sequence is determined by depends_on relationships or order in workstream
				const sorted = [...parentNodes].sort((a, b) => {
					// Use sequencingBefore/After to determine order
					// If A is before B (A in B's sequencingAfter or B in A's sequencingBefore), A comes first
					if (a.sequencingBefore.includes(b.entityId)) return -1;
					if (b.sequencingBefore.includes(a.entityId)) return 1;
					if (a.sequencingAfter.includes(b.entityId)) return 1;
					if (b.sequencingAfter.includes(a.entityId)) return -1;
					// Fallback: use entityId order (M-009 < M-012)
					return a.entityId.localeCompare(b.entityId);
				});

				console.log(`[PositioningV4] Resolved milestone conflict: picked ${sorted[0].entityId} (first in workstream) from [${parentIds.join(', ')}]`);
				return sorted[0].entityId;
			}
		}

		return undefined; // Can't resolve - truly conflicting
	}

	/**
	 * Check if ancestorId is an ancestor of descendantId in the containment hierarchy.
	 */
	private isAncestorOf(ancestorId: string, descendantId: string): boolean {
		let current = this.processedNodes.get(descendantId);
		const visited = new Set<string>();

		while (current && current.containmentParentId) {
			if (visited.has(current.entityId)) break; // Cycle detection
			visited.add(current.entityId);

			if (current.containmentParentId === ancestorId) {
				return true;
			}
			current = this.processedNodes.get(current.containmentParentId);
		}

		return false;
	}

	/**
	 * Get all containment parent IDs
	 */
	private getAllContainmentParents(node: ProcessedNode): string[] {
		const parents: string[] = [];
		if (node.containmentParentId) {
			parents.push(node.containmentParentId);
		}
		parents.push(...node.containmentEdgeTargets);
		return parents;
	}

	/**
	 * Get workstreams for a list of parent entity IDs
	 */
	private getWorkstreamsForParents(parentIds: string[]): Set<string> {
		const workstreams = new Set<string>();
		for (const parentId of parentIds) {
			const ws = this.getWorkstreamForEntity(parentId);
			if (ws) {
				workstreams.add(ws);
			}
		}
		return workstreams;
	}

	/**
	 * Get workstreams for sequencing targets
	 */
	private getWorkstreamsForSequencingTargets(node: ProcessedNode): Set<string> {
		const targetIds = [...node.sequencingBefore, ...node.sequencingAfter];
		return this.getWorkstreamsForParents(targetIds);
	}

	/**
	 * Get workstream for an entity (traversing up hierarchy if needed)
	 */
	private getWorkstreamForEntity(entityId: string): string | undefined {
		const node = this.processedNodes.get(entityId);
		if (!node) return undefined;

		// Milestone has direct workstream
		if (node.type === 'milestone') {
			return node.workstream || undefined;
		}

		// Others: try parent first, then fall back to own workstream
		if (node.containmentParentId) {
			return this.getWorkstreamForEntity(node.containmentParentId);
		}

		// Fallback to entity's own workstream field from frontmatter
		return node.workstream || undefined;
	}

	// ========================================================================
	// Phase 3.5: Infer Containment from Dependents
	// ========================================================================

	/**
	 * For stories, tasks, and decisions without explicit parent, infer containment from their dependents.
	 * Rules:
	 * 1. Same-workstream dependents win over cross-workstream dependents
	 * 2. If no same-workstream dependents, pull into dependent's workstream
	 * 3. If multiple dependents, earlier milestone (in topological order) wins
	 * 4. Apply recursively up the dependency chain
	 */
	private inferContainmentFromDependents(): void {
		console.log(`[PositioningV4] Phase 3.5: Inferring containment from dependents`);

		// Build reverse dependency map: entityId -> entities that depend on it (via blocks)
		const dependentsMap = this.buildDependentsMap();

		// Find stories, tasks, AND decisions without containment (floating or orphan)
		const entitiesWithoutParent = Array.from(this.processedNodes.values())
			.filter(n => (n.type === 'story' || n.type === 'task' || n.type === 'decision') && !n.containmentParentId);

		if (entitiesWithoutParent.length === 0) {
			console.log(`[PositioningV4] No stories/tasks/decisions without parent found`);
			return;
		}

		const storiesCount = entitiesWithoutParent.filter(n => n.type === 'story').length;
		const tasksCount = entitiesWithoutParent.filter(n => n.type === 'task').length;
		const decisionsCount = entitiesWithoutParent.filter(n => n.type === 'decision').length;
		console.log(`[PositioningV4] Found ${entitiesWithoutParent.length} entities without parent (${storiesCount} stories, ${tasksCount} tasks, ${decisionsCount} decisions)`);

		// Process entities iteratively until no more changes
		let changed = true;
		let iterations = 0;
		const maxIterations = entitiesWithoutParent.length + 1; // Prevent infinite loops

		while (changed && iterations < maxIterations) {
			changed = false;
			iterations++;

			for (const entity of entitiesWithoutParent) {
				if (entity.containmentParentId) continue; // Already resolved

				const inferredParent = this.inferParentFromDependents(entity, dependentsMap);
				if (inferredParent) {
					this.assignInferredContainment(entity, inferredParent);
					changed = true;
				}
			}
		}

		console.log(`[PositioningV4] Inferred containment completed in ${iterations} iterations`);

		// Log results
		const resolved = entitiesWithoutParent.filter(s => s.containmentParentId);
		const unresolved = entitiesWithoutParent.filter(s => !s.containmentParentId);
		console.log(`[PositioningV4] Resolved: ${resolved.length}, Unresolved: ${unresolved.length}`);
		for (const s of resolved) {
			console.log(`[PositioningV4]   ${s.entityId} -> ${s.containmentParentId}`);
		}
	}

	/**
	 * Build a map of entityId -> entities that depend on it (have it in their depends_on)
	 */
	private buildDependentsMap(): Map<string, ProcessedNode[]> {
		const dependentsMap = new Map<string, ProcessedNode[]>();

		for (const node of this.processedNodes.values()) {
			// sequencingAfter contains entities this node depends on (comes AFTER them)
			// So if A.sequencingAfter contains B, then A depends on B, meaning A is a dependent of B
			for (const depId of node.sequencingAfter) {
				if (!dependentsMap.has(depId)) {
					dependentsMap.set(depId, []);
				}
				dependentsMap.get(depId)!.push(node);
			}
		}

		return dependentsMap;
	}

	/**
	 * Infer parent for a story or decision based on its dependents.
	 *
	 * For decisions with decision dependents: infer to the SAME parent as the dependent decision
	 * (so they become siblings and can be positioned relative to each other).
	 *
	 * For stories or decisions with non-decision dependents: infer to the milestone.
	 */
	private inferParentFromDependents(
		entity: ProcessedNode,
		dependentsMap: Map<string, ProcessedNode[]>
	): string | undefined {
		const dependents = dependentsMap.get(entity.entityId) || [];
		if (dependents.length === 0) return undefined;

		const entityWorkstream = entity.workstream;

		// Separate dependents by workstream
		const sameWsDependents: ProcessedNode[] = [];
		const otherWsDependents: ProcessedNode[] = [];

		for (const dep of dependents) {
			const depWs = this.getWorkstreamForEntity(dep.entityId);
			if (depWs === entityWorkstream) {
				sameWsDependents.push(dep);
			} else {
				otherWsDependents.push(dep);
			}
		}

		// Rule 1: Same-workstream dependents win
		const candidateDependents = sameWsDependents.length > 0 ? sameWsDependents : otherWsDependents;

		if (candidateDependents.length === 0) return undefined;

		// Special handling for decisions: if we have decision dependents,
		// infer to the SAME parent as the dependent (not the milestone)
		// This ensures decisions with sequencing relationships become siblings
		if (entity.type === 'decision') {
			const decisionDependents = candidateDependents.filter(d => d.type === 'decision');
			if (decisionDependents.length > 0) {
				// Find a decision dependent that has a containment parent
				for (const dep of decisionDependents) {
					if (dep.containmentParentId) {
						console.log(`[PositioningV4] Inferring containment for ${entity.entityId} to same parent as ${dep.entityId}: ${dep.containmentParentId}`);
						return dep.containmentParentId;
					}
				}
			}
		}

		// Default behavior: find the milestone for each candidate dependent
		const milestoneOptions: { milestone: ProcessedNode; dependent: ProcessedNode }[] = [];

		for (const dep of candidateDependents) {
			const milestone = this.findMilestoneForEntity(dep);
			if (milestone) {
				milestoneOptions.push({ milestone, dependent: dep });
			}
		}

		if (milestoneOptions.length === 0) return undefined;

		// Rule 3: If multiple milestones, earlier one wins (leftmost in topological order)
		if (milestoneOptions.length === 1) {
			return milestoneOptions[0].milestone.entityId;
		}

		// Find the earliest milestone by comparing their positions in dependency order
		const earliestMilestone = this.findEarliestMilestone(milestoneOptions.map(o => o.milestone));
		return earliestMilestone?.entityId;
	}

	/**
	 * Find the milestone that contains an entity (traversing up the hierarchy)
	 */
	private findMilestoneForEntity(entity: ProcessedNode): ProcessedNode | undefined {
		let current: ProcessedNode | undefined = entity;

		while (current) {
			if (current.type === 'milestone') {
				return current;
			}
			if (current.containmentParentId) {
				current = this.processedNodes.get(current.containmentParentId);
			} else {
				return undefined;
			}
		}

		return undefined;
	}

	/**
	 * Find the earliest milestone among candidates (first in topological order)
	 */
	private findEarliestMilestone(milestones: ProcessedNode[]): ProcessedNode | undefined {
		if (milestones.length === 0) return undefined;
		if (milestones.length === 1) return milestones[0];

		// Group by workstream
		const byWorkstream = new Map<string, ProcessedNode[]>();
		for (const m of milestones) {
			const ws = m.workstream || 'unknown';
			if (!byWorkstream.has(ws)) {
				byWorkstream.set(ws, []);
			}
			byWorkstream.get(ws)!.push(m);
		}

		// For each workstream, find the earliest milestone using topological sort
		let earliest: ProcessedNode | undefined;
		let earliestOrder = Infinity;

		for (const [, wsMilestones] of byWorkstream) {
			const order = this.getTopologicalOrder(wsMilestones);
			for (const m of wsMilestones) {
				const mOrder = order.get(m.entityId) ?? Infinity;
				if (mOrder < earliestOrder) {
					earliestOrder = mOrder;
					earliest = m;
				}
			}
		}

		return earliest;
	}

	/**
	 * Get topological order for a set of milestones (0 = earliest)
	 */
	private getTopologicalOrder(milestones: ProcessedNode[]): Map<string, number> {
		const order = new Map<string, number>();
		const milestoneIds = new Set(milestones.map(m => m.entityId));

		// Build dependency graph within this set
		const inDegree = new Map<string, number>();
		const graph = new Map<string, Set<string>>();

		for (const m of milestones) {
			inDegree.set(m.entityId, 0);
			graph.set(m.entityId, new Set());
		}

		// Build edges - only use sequencingAfter to avoid double-counting
		// (sequencingBefore is the inverse of sequencingAfter, so using both would count each edge twice)
		for (const m of milestones) {
			// sequencingAfter: this comes AFTER target (target -> this)
			for (const depId of m.sequencingAfter) {
				if (milestoneIds.has(depId)) {
					// Only add edge if not already present (avoid duplicates)
					if (!graph.get(depId)!.has(m.entityId)) {
						graph.get(depId)!.add(m.entityId);
						inDegree.set(m.entityId, (inDegree.get(m.entityId) || 0) + 1);
					}
				}
			}
		}

		// Kahn's algorithm
		const queue: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) queue.push(id);
		}

		// Debug: Log the dependency graph
		console.log(`[PositioningV4] Topological sort for ${milestones.length} milestones:`);
		for (const m of milestones) {
			const deps = m.sequencingAfter.filter(d => milestoneIds.has(d));
			const targets = m.sequencingBefore.filter(t => milestoneIds.has(t));
			if (deps.length > 0 || targets.length > 0) {
				console.log(`[PositioningV4]   ${m.entityId}: inDegree=${inDegree.get(m.entityId)}, comesAfter=[${deps.join(',')}], comesBefore=[${targets.join(',')}]`);
			}
		}

		let orderIndex = 0;
		while (queue.length > 0) {
			const current = queue.shift()!;
			order.set(current, orderIndex++);

			for (const next of graph.get(current) || []) {
				const newDegree = (inDegree.get(next) || 1) - 1;
				inDegree.set(next, newDegree);
				if (newDegree === 0) {
					queue.push(next);
				}
			}
		}

		// Debug: Log the final order
		const sortedByOrder = [...order.entries()].sort((a, b) => a[1] - b[1]);
		console.log(`[PositioningV4]   Final order: ${sortedByOrder.map(([id, idx]) => `${id}(${idx})`).join(' → ')}`);

		return order;
	}

	/**
	 * Assign inferred containment to a story and update category
	 */
	private assignInferredContainment(story: ProcessedNode, parentMilestoneId: string): void {
		const parent = this.processedNodes.get(parentMilestoneId);
		if (!parent) return;

		console.log(`[PositioningV4] Inferring containment: ${story.entityId} -> ${parentMilestoneId}`);

		// Update containment
		story.containmentParentId = parentMilestoneId;

		// Update workstream if being pulled into different workstream
		if (parent.workstream && parent.workstream !== story.workstream) {
			console.log(`[PositioningV4]   Pulling ${story.entityId} from ${story.workstream} to ${parent.workstream}`);
			story.workstream = parent.workstream;
		}

		// Update category
		story.category = 'contained';

		// Remove from floating/orphan lists
		this.floatingSingleWs = this.floatingSingleWs.filter(f => f.node.entityId !== story.entityId);
		this.floatingMultiWs = this.floatingMultiWs.filter(f => f.node.entityId !== story.entityId);
		this.orphanedEntities = this.orphanedEntities.filter(o => o.entityId !== story.entityId);

		// Add to contained list and parent's children
		if (!this.containedEntities.includes(story)) {
			this.containedEntities.push(story);
		}
		if (!parent.children.includes(story)) {
			parent.children.push(story);
		}
	}

	// ========================================================================
	// Phase 4: Detect Circular Dependencies
	// ========================================================================

	private detectCircularDependencies(): void {
		console.log(`[PositioningV4] Phase 4: Detecting circular dependencies`);

		// Build workstream groups first
		this.buildWorkstreamGroups();

		// Check for cycles in milestone dependencies within each workstream
		for (const [wsName, ws] of this.workstreams) {
			this.detectCyclesInGroup(ws.milestones, wsName, 'milestone');
		}

		// Check for cycles in story dependencies within each milestone
		for (const node of this.processedNodes.values()) {
			if (node.type === 'milestone' && node.children.length > 0) {
				const stories = node.children.filter(c => c.type === 'story');
				if (stories.length > 1) {
					this.detectCyclesInGroup(stories, node.entityId, 'story');
				}
			}
		}
	}

	/**
	 * Build workstream groups from milestones
	 */
	private buildWorkstreamGroups(): void {
		for (const node of this.processedNodes.values()) {
			if (node.type === 'milestone' && node.workstream) {
				if (!this.workstreams.has(node.workstream)) {
					this.workstreams.set(node.workstream, {
						name: node.workstream,
						milestones: [],
						floatingEntities: [],
						baseY: 0,
						height: 0,
					});
				}
				this.workstreams.get(node.workstream)!.milestones.push(node);
			}
		}
		console.log(`[PositioningV4] Built ${this.workstreams.size} workstream groups`);
	}

	/**
	 * Detect cycles in a group of nodes using DFS
	 */
	private detectCyclesInGroup(nodes: ProcessedNode[], groupName: string, nodeType: string): void {
		const nodeIds = new Set(nodes.map(n => n.entityId));

		// Build adjacency list using sequencing relationships
		const graph = new Map<string, Set<string>>();
		for (const n of nodes) {
			graph.set(n.entityId, new Set());
		}

		for (const n of nodes) {
			// sequencingBefore: this comes BEFORE target (edge: this -> target)
			for (const targetId of n.sequencingBefore) {
				if (nodeIds.has(targetId)) {
					graph.get(n.entityId)!.add(targetId);
				}
			}
			// sequencingAfter: this comes AFTER target (edge: target -> this)
			for (const targetId of n.sequencingAfter) {
				if (nodeIds.has(targetId)) {
					if (!graph.has(targetId)) graph.set(targetId, new Set());
					graph.get(targetId)!.add(n.entityId);
				}
			}
		}

		// DFS to detect cycles
		const visited = new Set<string>();
		const recursionStack = new Set<string>();
		const cyclesFound = new Set<string>();

		const hasCycle = (nodeId: string, path: string[]): boolean => {
			if (recursionStack.has(nodeId)) {
				const cycleStart = path.indexOf(nodeId);
				const cycle = path.slice(cycleStart).concat(nodeId);
				const cycleKey = cycle.sort().join(',');
				if (!cyclesFound.has(cycleKey)) {
					cyclesFound.add(cycleKey);
					this.errors.push(`Circular dependency in ${nodeType}s of "${groupName}": ${cycle.join(' → ')}`);
				}
				return true;
			}
			if (visited.has(nodeId)) return false;

			visited.add(nodeId);
			recursionStack.add(nodeId);

			for (const neighbor of graph.get(nodeId) || []) {
				hasCycle(neighbor, [...path, nodeId]);
			}

			recursionStack.delete(nodeId);
			return false;
		};

		for (const n of nodes) {
			if (!visited.has(n.entityId)) {
				hasCycle(n.entityId, []);
			}
		}
	}

	// ========================================================================
	// Phase 5: Calculate Container Sizes (Bottom-Up)
	// ========================================================================

	private calculateAllContainerSizes(): void {
		console.log(`[PositioningV4] Phase 5: Calculating container sizes`);

		// Calculate sizes for all milestones (which recursively calculates children)
		for (const ws of this.workstreams.values()) {
			for (const milestone of ws.milestones) {
				this.calculateContainerSize(milestone);
			}
		}

		// Calculate sizes for orphaned entities (they might have children via dependency chains)
		for (const orphan of this.orphanedEntities) {
			this.calculateContainerSize(orphan);
		}

		// Calculate sizes for floating entities
		for (const floating of [...this.floatingSingleWs, ...this.floatingMultiWs]) {
			this.calculateContainerSize(floating.node);
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
			// Dependency-aware grid layout
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
			// Grid layout: optimal arrangement
			const grid = this.calculateOptimalGrid(node.children);
			const n = node.children.length;

			const itemsInTopRow = n % grid.columns || grid.columns;
			const emptySlots = grid.columns - itemsInTopRow;

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
				height: gridHeight + this.config.childGap + nodeSize.height,
				gridColumns: grid.columns,
				gridRows: grid.rows,
			};
		}

		return node.containerSize;
	}

	/**
	 * Check if siblings have sequencing relationships
	 */
	private hasSiblingDependencies(children: ProcessedNode[]): boolean {
		if (children.length <= 1) return false;

		const siblingIds = new Set(children.map(c => c.entityId));

		for (const child of children) {
			for (const targetId of [...child.sequencingBefore, ...child.sequencingAfter]) {
				if (siblingIds.has(targetId)) return true;
			}
		}
		return false;
	}

	/**
	 * Assign dependency levels to siblings for grid layout
	 */
	private assignDependencyLevels(siblings: ProcessedNode[]): { child: ProcessedNode; level: number }[] {
		if (siblings.length === 0) return [];
		if (siblings.length === 1) return [{ child: siblings[0], level: 0 }];

		const siblingIds = new Set(siblings.map(s => s.entityId));

		// Build adjacency list
		const graph = new Map<string, Set<string>>();
		const reverseGraph = new Map<string, Set<string>>();

		for (const s of siblings) {
			graph.set(s.entityId, new Set());
			reverseGraph.set(s.entityId, new Set());
		}

		for (const s of siblings) {
			// sequencingBefore: this comes BEFORE target (this -> target)
			for (const targetId of s.sequencingBefore) {
				if (siblingIds.has(targetId) && !graph.get(s.entityId)!.has(targetId)) {
					graph.get(s.entityId)!.add(targetId);
					reverseGraph.get(targetId)!.add(s.entityId);
				}
			}
			// sequencingAfter: this comes AFTER target (target -> this)
			for (const targetId of s.sequencingAfter) {
				if (siblingIds.has(targetId) && !graph.get(targetId)!.has(s.entityId)) {
					graph.get(targetId)!.add(s.entityId);
					reverseGraph.get(s.entityId)!.add(targetId);
				}
			}
		}

		// Calculate levels using longest path from roots
		const levels = new Map<string, number>();
		const queue: string[] = [];

		for (const s of siblings) {
			if (reverseGraph.get(s.entityId)!.size === 0) {
				levels.set(s.entityId, 0);
				queue.push(s.entityId);
			}
		}

		while (queue.length > 0) {
			const id = queue.shift()!;
			const currentLevel = levels.get(id)!;

			for (const successor of graph.get(id)!) {
				const newLevel = currentLevel + 1;
				const existingLevel = levels.get(successor);

				if (existingLevel === undefined || newLevel > existingLevel) {
					levels.set(successor, newLevel);
				}

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

		// Handle any nodes not reached
		for (const s of siblings) {
			if (!levels.has(s.entityId)) {
				levels.set(s.entityId, 0);
			}
		}

		const result = siblings.map(child => ({
			child,
			level: levels.get(child.entityId)!
		}));

		result.sort((a, b) => {
			if (a.level !== b.level) return a.level - b.level;
			return a.child.entityId.localeCompare(b.child.entityId);
		});

		// Debug logging for decisions
		const decisions = result.filter(r => r.child.type === 'decision');
		if (decisions.length > 0) {
			console.log(`[PositioningV4] Decision level assignments:`);
			for (const { child, level } of decisions) {
				console.log(`[PositioningV4]   ${child.entityId}: level=${level}, sequencingBefore=${JSON.stringify(child.sequencingBefore)}, sequencingAfter=${JSON.stringify(child.sequencingAfter)}`);
			}
		}

		return result;
	}

	/**
	 * Calculate optimal grid arrangement
	 */
	private calculateOptimalGrid(children: ProcessedNode[]): { columns: number; rows: number } {
		const n = children.length;
		if (n === 0) return { columns: 0, rows: 0 };
		if (n === 1) return { columns: 1, rows: 1 };

		const sortedChildren = [...children].sort((a, b) => {
			const aSize = (a.containerSize?.width || 0) * (a.containerSize?.height || 0);
			const bSize = (b.containerSize?.width || 0) * (b.containerSize?.height || 0);
			return bSize - aSize;
		});

		let bestMaxSide = Infinity;
		let bestCols = 1;
		let bestRows = n;

		for (let cols = 1; cols <= n; cols++) {
			const rows = Math.ceil(n / cols);
			const colWidths: number[] = new Array(cols).fill(0);
			const rowHeights: number[] = new Array(rows).fill(0);

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

	// ========================================================================
	// Phase 6: Position Workstreams and Milestones
	// ========================================================================

	private positionWorkstreams(): void {
		console.log(`[PositioningV4] Phase 6: Positioning workstreams and milestones`);

		// Filter out empty workstreams
		const nonEmptyWorkstreams = Array.from(this.workstreams.values())
			.filter(ws => ws.milestones.length > 0);

		// Order workstreams to minimize cross-workstream edge lengths
		const sortedWorkstreams = this.orderWorkstreamsByDependencyDensity(nonEmptyWorkstreams);

		if (sortedWorkstreams.length === 0) {
			console.log('[PositioningV4] No workstreams with milestones to position');
			return;
		}

		// Calculate workstream heights
		let totalHeight = 0;
		for (const ws of sortedWorkstreams) {
			let maxHeight = 0;
			for (const m of ws.milestones) {
				const containerHeight = m.containerSize?.height || 0;
				maxHeight = Math.max(maxHeight, containerHeight);
			}
			ws.height = Math.max(maxHeight, this.config.nodeSizes.milestone.height);
			totalHeight += ws.height;
		}
		totalHeight += Math.max(0, sortedWorkstreams.length - 1) * this.config.workstreamGap;

		// Sort milestones within each workstream by dependencies
		const sortedMilestonesByWs = new Map<string, ProcessedNode[]>();
		for (const ws of sortedWorkstreams) {
			sortedMilestonesByWs.set(ws.name, this.sortBySequencing(ws.milestones));
		}

		// Collect cross-workstream dependencies
		const crossWsDeps: { source: string; target: string }[] = [];
		const allMilestoneIds = new Set<string>();
		for (const ws of sortedWorkstreams) {
			for (const m of ws.milestones) {
				allMilestoneIds.add(m.entityId);
			}
		}

		for (const ws of sortedWorkstreams) {
			for (const m of ws.milestones) {
				// Check sequencingAfter for cross-workstream deps (this comes AFTER target)
				for (const depId of m.sequencingAfter) {
					if (allMilestoneIds.has(depId)) {
						const depNode = this.processedNodes.get(depId);
						if (depNode && depNode.workstream !== m.workstream) {
							crossWsDeps.push({ source: depId, target: m.entityId });
						}
					}
				}
				// Check sequencingBefore for cross-workstream deps (this comes BEFORE target)
				for (const targetId of m.sequencingBefore) {
					if (allMilestoneIds.has(targetId)) {
						const targetNode = this.processedNodes.get(targetId);
						if (targetNode && targetNode.workstream !== m.workstream) {
							crossWsDeps.push({ source: m.entityId, target: targetId });
						}
					}
				}
			}
		}
		console.log(`[PositioningV4] Total cross-workstream deps: ${crossWsDeps.length}`);
		for (const dep of crossWsDeps) {
			console.log(`[PositioningV4]   Cross-WS dep: ${dep.source} -> ${dep.target} (${dep.source} must be LEFT of ${dep.target})`);
		}

		// Debug: Log milestone sequencing info for cross-WS deps
		const crossWsMilestones = new Set([...crossWsDeps.map(d => d.source), ...crossWsDeps.map(d => d.target)]);
		for (const mId of crossWsMilestones) {
			const m = this.processedNodes.get(mId);
			if (m) {
				console.log(`[PositioningV4]   Milestone ${mId}: workstream=${m.workstream}, sequencingAfter=[${m.sequencingAfter.join(',')}], sequencingBefore=[${m.sequencingBefore.join(',')}]`);
			}
		}

		// Position milestones with constraint propagation
		const milestoneX = new Map<string, number>();
		const milestoneEndX = new Map<string, number>();
		const milestoneNodeEndX = new Map<string, number>();

		// Initialize all milestones with X=0
		for (const ws of sortedWorkstreams) {
			for (const m of ws.milestones) {
				const containerWidth = m.containerSize?.width || this.config.nodeSizes.milestone.width;
				milestoneX.set(m.entityId, 0);
				milestoneEndX.set(m.entityId, containerWidth);
				milestoneNodeEndX.set(m.entityId, containerWidth);
			}
		}

		// Multiple passes to resolve all constraints
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
							const sourceNodeEndX = milestoneNodeEndX.get(dep.source) || 0;
							const newMinX = sourceNodeEndX + this.config.containerGap;
							if (newMinX > minX) {
								minX = newMinX;
							}
						}
					}

					const oldX = milestoneX.get(milestone.entityId) || 0;
					if (minX > oldX) {
						milestoneX.set(milestone.entityId, minX);
						milestoneEndX.set(milestone.entityId, minX + containerWidth);
						milestoneNodeEndX.set(milestone.entityId, minX + containerWidth);
						changed = true;
					}
				}
			}

			if (!changed) {
				console.log(`[PositioningV4] Constraint propagation converged after ${iteration + 1} iterations`);
				break;
			}
		}

		// Debug: Log final X positions for ALL milestones to understand the chain
		console.log(`[PositioningV4] Final milestone positions:`);
		for (const ws of sortedWorkstreams) {
			console.log(`[PositioningV4]   Workstream ${ws.name}:`);
			const sortedMilestones = sortedMilestonesByWs.get(ws.name)!;
			for (const m of sortedMilestones) {
				const x = milestoneX.get(m.entityId) || 0;
				const endX = milestoneEndX.get(m.entityId) || 0;
				const isCrossWs = crossWsMilestones.has(m.entityId);
				console.log(`[PositioningV4]     ${m.entityId}: x=${x}, endX=${endX}${isCrossWs ? ' [CROSS-WS]' : ''}`);
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
				milestone.position = {
					x: containerX + containerSize.width - nodeSize.width,
					y: currentY + ws.height - nodeSize.height,
					width: nodeSize.width,
					height: nodeSize.height,
				};
			}

			currentY += ws.height + this.config.workstreamGap;
		}

		console.log(`[PositioningV4] Positioned ${sortedWorkstreams.length} workstreams`);
	}

	/**
	 * Order workstreams to minimize cross-workstream edge lengths
	 */
	private orderWorkstreamsByDependencyDensity(workstreams: WorkstreamData[]): WorkstreamData[] {
		if (workstreams.length <= 2) {
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
				for (const depId of m.sequencingAfter) {
					const depNode = this.processedNodes.get(depId);
					if (depNode && depNode.workstream !== ws.name) {
						const otherWs = depNode.workstream;
						if (depCount.get(ws.name)?.has(otherWs)) {
							depCount.get(ws.name)!.set(otherWs, depCount.get(ws.name)!.get(otherWs)! + 1);
							depCount.get(otherWs)!.set(ws.name, depCount.get(otherWs)!.get(ws.name)! + 1);
						}
					}
				}
				for (const targetId of m.sequencingBefore) {
					const targetNode = this.processedNodes.get(targetId);
					if (targetNode && targetNode.workstream !== ws.name) {
						const otherWs = targetNode.workstream;
						if (depCount.get(ws.name)?.has(otherWs)) {
							depCount.get(ws.name)!.set(otherWs, depCount.get(ws.name)!.get(otherWs)! + 1);
							depCount.get(otherWs)!.set(ws.name, depCount.get(otherWs)!.get(ws.name)! + 1);
						}
					}
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

		// Greedy ordering
		const ordered: WorkstreamData[] = [];
		const remaining = new Set(workstreams.map(ws => ws.name));

		let maxDeps = -1;
		let startWs = '';
		for (const ws of workstreams) {
			const deps = totalDeps.get(ws.name)!;
			if (deps > maxDeps) {
				maxDeps = deps;
				startWs = ws.name;
			}
		}

		if (maxDeps === 0) {
			return workstreams.sort((a, b) => a.name.localeCompare(b.name));
		}

		ordered.push(workstreams.find(ws => ws.name === startWs)!);
		remaining.delete(startWs);

		while (remaining.size > 0) {
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

			if (bestWs === '') {
				bestWs = Array.from(remaining).sort()[0];
			}

			ordered.push(workstreams.find(ws => ws.name === bestWs)!);
			remaining.delete(bestWs);
		}

		return ordered;
	}

	/**
	 * Sort nodes by sequencing relationships (topological sort)
	 */
	private sortBySequencing(nodes: ProcessedNode[]): ProcessedNode[] {
		if (nodes.length <= 1) return nodes;

		const nodeIds = new Set(nodes.map(n => n.entityId));

		// Check if this is a milestone sort (for debugging)
		const isMilestoneSort = nodes.length > 0 && nodes[0].type === 'milestone';
		const wsName = isMilestoneSort ? nodes[0].workstream : '';

		// Build adjacency list
		const graph = new Map<string, Set<string>>();
		const inDegree = new Map<string, number>();

		for (const n of nodes) {
			graph.set(n.entityId, new Set());
			inDegree.set(n.entityId, 0);
		}

		// Build edges - only use sequencingAfter to avoid double-counting
		// (sequencingBefore is the inverse of sequencingAfter, so using both would count each edge twice)
		for (const n of nodes) {
			// sequencingAfter: this comes AFTER target (target -> this)
			for (const depId of n.sequencingAfter) {
				if (nodeIds.has(depId)) {
					// Only add edge if not already present (avoid duplicates)
					if (!graph.get(depId)!.has(n.entityId)) {
						graph.get(depId)!.add(n.entityId);
						inDegree.set(n.entityId, (inDegree.get(n.entityId) || 0) + 1);
					}
				}
			}
		}

		// Debug logging for milestone sorts
		if (isMilestoneSort) {
			console.log(`[PositioningV4] sortBySequencing for workstream "${wsName}" (${nodes.length} milestones):`);
			for (const n of nodes) {
				const sameWsAfter = n.sequencingAfter.filter(id => nodeIds.has(id));
				const sameWsBefore = n.sequencingBefore.filter(id => nodeIds.has(id));
				if (sameWsAfter.length > 0 || sameWsBefore.length > 0) {
					console.log(`[PositioningV4]   ${n.entityId}: inDegree=${inDegree.get(n.entityId)}, comesAfter=[${sameWsAfter.join(',')}], comesBefore=[${sameWsBefore.join(',')}]`);
				}
			}
		}

		// Topological sort using Kahn's algorithm
		const queue: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) queue.push(id);
		}

		const sorted: ProcessedNode[] = [];
		const nodeMap = new Map(nodes.map(n => [n.entityId, n]));

		while (queue.length > 0) {
			queue.sort();
			const id = queue.shift()!;
			sorted.push(nodeMap.get(id)!);

			for (const neighbor of graph.get(id) || []) {
				const newDegree = (inDegree.get(neighbor) || 0) - 1;
				inDegree.set(neighbor, newDegree);
				if (newDegree === 0) queue.push(neighbor);
			}
		}

		// Add remaining (cycle members)
		if (sorted.length < nodes.length) {
			for (const n of nodes) {
				if (!sorted.includes(n)) {
					sorted.push(n);
				}
			}
		}

		// Debug: Log final order for milestone sorts
		if (isMilestoneSort) {
			console.log(`[PositioningV4]   Sorted order: ${sorted.map(n => n.entityId).join(' → ')}`);
		}

		return sorted;
	}

	// ========================================================================
	// Phase 7: Position Stories with Cross-WS Constraints
	// ========================================================================

	private positionStoriesWithCrossWsConstraints(): void {
		console.log(`[PositioningV4] Phase 7: Positioning stories with cross-WS constraints`);

		// Find all stories that have cross-workstream sequencing relationships
		for (const ws of this.workstreams.values()) {
			for (const milestone of ws.milestones) {
				const stories = milestone.children.filter(c => c.type === 'story');
				if (stories.length === 0) continue;

				// Check for cross-workstream story dependencies
				for (const story of stories) {
					const crossWsTargets = this.getCrossWsSequencingTargets(story);
					if (crossWsTargets.length > 0) {
						// Apply position constraints from cross-ws targets
						this.applyStoryCrossWsConstraints(story, crossWsTargets);
					}
				}
			}
		}
	}

	/**
	 * Get cross-workstream sequencing targets for a story
	 */
	private getCrossWsSequencingTargets(story: ProcessedNode): ProcessedNode[] {
		const targets: ProcessedNode[] = [];
		const storyWs = this.getWorkstreamForEntity(story.entityId);

		for (const targetId of [...story.sequencingBefore, ...story.sequencingAfter]) {
			const target = this.processedNodes.get(targetId);
			if (target && target.type === 'story') {
				const targetWs = this.getWorkstreamForEntity(targetId);
				if (targetWs && targetWs !== storyWs) {
					targets.push(target);
				}
			}
		}

		return targets;
	}

	/**
	 * Apply cross-workstream constraints to a story's position
	 */
	private applyStoryCrossWsConstraints(story: ProcessedNode, crossWsTargets: ProcessedNode[]): void {
		// For now, just log - actual positioning happens in Phase 8
		// The constraint is: story should be positioned relative to its cross-ws targets
		console.log(`[PositioningV4] Story ${story.entityId} has cross-WS constraints with: ${crossWsTargets.map(t => t.entityId).join(', ')}`);

		// Store cross-ws constraint info for use in Phase 8
		(story as any)._crossWsTargets = crossWsTargets;
	}

	// ========================================================================
	// Phase 8: Position Children Within Containers
	// ========================================================================

	private positionAllChildren(): void {
		console.log(`[PositioningV4] Phase 8: Positioning children within containers`);

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

		// Debug logging for S-042
		if (parent.entityId === 'S-042') {
			console.log(`[PositioningV4] DEBUG Phase 8: Positioning children of S-042: [${parent.children.map(c => c.entityId).join(', ')}]`);
		}

		const parentPos = parent.position!;
		const hasDeps = this.hasSiblingDependencies(parent.children);

		if (hasDeps) {
			// Dependency-aware grid layout
			const levelAssignments = (parent as any)._levelAssignments as { child: ProcessedNode; level: number }[];
			const colWidths = (parent as any)._colWidths as number[];
			const gridHeight = (parent as any)._gridHeight as number;

			if (!levelAssignments || !colWidths) {
				console.warn(`[PositioningV4] Missing level assignments for ${parent.entityId}`);
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

			const gridWidth = colWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, colWidths.length - 1) * this.config.childGap;
			const gridStartX = parentPos.x - this.config.childGap - gridWidth;
			const gridStartY = parentPos.y - this.config.childGap - gridHeight;

			for (const { child, level } of levelAssignments) {
				const childNodeSize = this.config.nodeSizes[child.type];
				const childContainerSize = child.containerSize!;

				let colStartX = gridStartX;
				for (let c = 0; c < level; c++) {
					colStartX += colWidths[c] + this.config.childGap;
				}
				const childX = colStartX + (colWidths[level] - childContainerSize.width);

				const siblings = levelGroups.get(level)!;
				const indexInColumn = siblings.indexOf(child);
				let childY = gridStartY;
				for (let i = 0; i < indexInColumn; i++) {
					childY += siblings[i].containerSize!.height + this.config.childGap;
				}

				child.position = {
					x: childX + childContainerSize.width - childNodeSize.width,
					y: childY + childContainerSize.height - childNodeSize.height,
					width: childNodeSize.width,
					height: childNodeSize.height,
				};

				this.positionChildrenRecursive(child);
			}
		} else {
			// Grid layout
			parent.children.sort((a, b) => {
				const aSize = (a.containerSize?.width || 0) * (a.containerSize?.height || 0);
				const bSize = (b.containerSize?.width || 0) * (b.containerSize?.height || 0);
				return bSize - aSize;
			});

			const grid = this.calculateOptimalGrid(parent.children);
			const n = parent.children.length;
			const itemsInTopRow = n % grid.columns || grid.columns;
			const emptySlots = grid.columns - itemsInTopRow;

			const childPositions: { child: ProcessedNode; row: number; col: number }[] = [];
			for (let i = 0; i < n; i++) {
				const adjustedIndex = i + emptySlots;
				const row = Math.floor(adjustedIndex / grid.columns);
				const col = adjustedIndex % grid.columns;
				childPositions.push({ child: parent.children[i], row, col });
			}

			const rowHeights: number[] = new Array(grid.rows).fill(0);
			const colWidths: number[] = new Array(grid.columns).fill(0);

			for (const { child, row, col } of childPositions) {
				const childSize = child.containerSize!;
				colWidths[col] = Math.max(colWidths[col], childSize.width);
				rowHeights[row] = Math.max(rowHeights[row], childSize.height);
			}

			const gridWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length - 1) * this.config.childGap;
			const gridHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (rowHeights.length - 1) * this.config.childGap;
			const gridStartX = parentPos.x - this.config.childGap - gridWidth;
			const gridStartY = parentPos.y - this.config.childGap - gridHeight;

			for (const { child, row, col } of childPositions) {
				const childNodeSize = this.config.nodeSizes[child.type];
				const childContainerSize = child.containerSize!;

				let colStartX = gridStartX;
				for (let c = 0; c < col; c++) {
					colStartX += colWidths[c] + this.config.childGap;
				}
				const childX = colStartX + (colWidths[col] - childContainerSize.width);

				let childY = gridStartY;
				for (let r = 0; r < row; r++) {
					childY += rowHeights[r] + this.config.childGap;
				}

				child.position = {
					x: childX + childContainerSize.width - childNodeSize.width,
					y: childY + rowHeights[row] - childNodeSize.height,
					width: childNodeSize.width,
					height: childNodeSize.height,
				};

				this.positionChildrenRecursive(child);
			}
		}
	}

	// ========================================================================
	// Phase 9: Position Floating Entities
	// ========================================================================

	private positionFloatingEntities(): void {
		console.log(`[PositioningV4] Phase 9: Positioning floating entities`);

		// Position single-workstream floating entities (on top of their workstream)
		for (const floating of this.floatingSingleWs) {
			this.positionFloatingSingleWs(floating);
		}

		// Position multi-workstream floating entities (between workstreams)
		this.positionFloatingMultiWs();
	}

	/**
	 * Position a floating entity on top of its single workstream
	 */
	private positionFloatingSingleWs(floating: FloatingEntity): void {
		const wsName = Array.from(floating.targetWorkstreams)[0];
		const ws = this.workstreams.get(wsName);
		if (!ws) {
			// Fallback to orphan
			this.orphanedEntities.push(floating.node);
			return;
		}

		// Find the X position based on sequencing targets
		const targetPositions: number[] = [];
		for (const targetId of floating.sequencingTargetIds) {
			const target = this.processedNodes.get(targetId);
			if (target?.position) {
				targetPositions.push(target.position.x);
			}
		}

		const nodeSize = this.config.nodeSizes[floating.node.type];
		let x = 0;

		if (targetPositions.length > 0) {
			// Center horizontally among targets
			const minX = Math.min(...targetPositions);
			const maxX = Math.max(...targetPositions);
			x = (minX + maxX) / 2 - nodeSize.width / 2;
		}

		// Position above the workstream
		floating.node.position = {
			x,
			y: ws.baseY - this.config.childGap - nodeSize.height,
			width: nodeSize.width,
			height: nodeSize.height,
		};

		// Add to workstream's floating entities for tracking
		ws.floatingEntities.push(floating.node);
	}

	/**
	 * Position multi-workstream floating entities between workstreams
	 */
	private positionFloatingMultiWs(): void {
		if (this.floatingMultiWs.length === 0) return;

		// Group by workstream pairs
		const byWorkstreamPair = new Map<string, FloatingEntity[]>();

		for (const floating of this.floatingMultiWs) {
			const wsArray = Array.from(floating.targetWorkstreams).sort();
			const key = wsArray.join('|');
			if (!byWorkstreamPair.has(key)) {
				byWorkstreamPair.set(key, []);
			}
			byWorkstreamPair.get(key)!.push(floating);
		}

		// For each pair, create a band between the workstreams
		for (const [key, floatings] of byWorkstreamPair) {
			const wsNames = key.split('|');
			const ws1 = this.workstreams.get(wsNames[0]);
			const ws2 = this.workstreams.get(wsNames[1]);

			if (!ws1 || !ws2) continue;

			// Find Y position between the two workstreams
			const ws1Bottom = ws1.baseY + ws1.height;
			const ws2Top = ws2.baseY;
			const bandY = (ws1Bottom + ws2Top) / 2;

			// Position entities based on their sequencing targets
			for (const floating of floatings) {
				const nodeSize = this.config.nodeSizes[floating.node.type];

				// Find X position from targets
				const targetPositions: number[] = [];
				for (const targetId of floating.sequencingTargetIds) {
					const target = this.processedNodes.get(targetId);
					if (target?.position) {
						targetPositions.push(target.position.x);
					}
				}

				let x = 0;
				if (targetPositions.length > 0) {
					const minX = Math.min(...targetPositions);
					const maxX = Math.max(...targetPositions);
					x = (minX + maxX) / 2 - nodeSize.width / 2;
				}

				floating.node.position = {
					x,
					y: bandY - nodeSize.height / 2,
					width: nodeSize.width,
					height: nodeSize.height,
				};
			}
		}
	}

	// ========================================================================
	// Phase 10: Position Deferred (Multi-Parent) Entities
	// ========================================================================

	private positionDeferredEntities(): void {
		console.log(`[PositioningV4] Phase 10: Positioning deferred (multi-parent) entities`);

		// Group by whether they cross workstreams
		const sameWorkstream: DeferredEntity[] = [];
		const crossWorkstream: DeferredEntity[] = [];

		for (const deferred of this.deferredEntities) {
			if (deferred.parentWorkstreams.size === 1) {
				sameWorkstream.push(deferred);
			} else {
				crossWorkstream.push(deferred);
			}
		}

		// Position same-workstream entities centered above parents
		for (const deferred of sameWorkstream) {
			this.positionDeferredSameWorkstream(deferred);
		}

		// Position cross-workstream entities in bands between workstreams
		this.positionDeferredCrossWorkstream(crossWorkstream);
	}

	private positionDeferredSameWorkstream(deferred: DeferredEntity): void {
		const containerBounds: { minX: number; maxX: number; minY: number }[] = [];

		for (const parentId of deferred.parentEntityIds) {
			const parent = this.processedNodes.get(parentId);
			if (parent?.position && parent.containerSize) {
				const containerMinX = parent.position.x + parent.position.width - parent.containerSize.width;
				const containerMaxX = parent.position.x + parent.position.width;
				const containerMinY = parent.position.y + parent.position.height - parent.containerSize.height;
				containerBounds.push({ minX: containerMinX, maxX: containerMaxX, minY: containerMinY });
			} else if (parent?.position) {
				containerBounds.push({
					minX: parent.position.x,
					maxX: parent.position.x + parent.position.width,
					minY: parent.position.y
				});
			}
		}

		if (containerBounds.length === 0) {
			this.orphanedEntities.push(deferred.node);
			return;
		}

		const minX = Math.min(...containerBounds.map(b => b.minX));
		const maxX = Math.max(...containerBounds.map(b => b.maxX));
		const minY = Math.min(...containerBounds.map(b => b.minY));

		const nodeSize = this.config.nodeSizes[deferred.node.type];

		deferred.node.position = {
			x: (minX + maxX) / 2 - nodeSize.width / 2,
			y: minY - this.config.childGap - nodeSize.height,
			width: nodeSize.width,
			height: nodeSize.height,
		};
	}

	private positionDeferredCrossWorkstream(entities: DeferredEntity[]): void {
		if (entities.length === 0) return;

		const byWorkstreamPair = new Map<string, DeferredEntity[]>();

		for (const deferred of entities) {
			const wsArray = Array.from(deferred.parentWorkstreams).sort();
			const key = wsArray.join('|');
			if (!byWorkstreamPair.has(key)) {
				byWorkstreamPair.set(key, []);
			}
			byWorkstreamPair.get(key)!.push(deferred);
		}

		for (const [key, deferreds] of byWorkstreamPair) {
			const wsNames = key.split('|');
			const ws1 = this.workstreams.get(wsNames[0]);
			const ws2 = this.workstreams.get(wsNames[1]);

			if (!ws1 || !ws2) continue;

			const ws1Bottom = ws1.baseY + ws1.height;
			const ws2Top = ws2.baseY;
			const bandY = (ws1Bottom + ws2Top) / 2;

			for (const deferred of deferreds) {
				const nodeSize = this.config.nodeSizes[deferred.node.type];

				const containerBounds: { minX: number; maxX: number }[] = [];
				for (const parentId of deferred.parentEntityIds) {
					const parent = this.processedNodes.get(parentId);
					if (parent?.position && parent.containerSize) {
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

				let x = 0;
				if (containerBounds.length > 0) {
					const minX = Math.min(...containerBounds.map(b => b.minX));
					const maxX = Math.max(...containerBounds.map(b => b.maxX));
					x = (minX + maxX) / 2 - nodeSize.width / 2;
				}

				deferred.node.position = {
					x,
					y: bandY - nodeSize.height / 2,
					width: nodeSize.width,
					height: nodeSize.height,
				};
			}
		}
	}

	// ========================================================================
	// Phase 11: Position Orphans
	// ========================================================================

	private positionOrphans(): void {
		if (this.orphanedEntities.length === 0) return;

		console.log(`[PositioningV4] Phase 11: Positioning ${this.orphanedEntities.length} orphans`);

		// Find the bottom of all positioned content
		let maxY = 0;
		for (const node of this.processedNodes.values()) {
			if (node.position) {
				maxY = Math.max(maxY, node.position.y + node.position.height);
			}
		}

		// Separate orphans with children from simple orphans
		const orphansWithChildren = this.orphanedEntities.filter(o => o.children.length > 0);
		const simpleOrphans = this.orphanedEntities.filter(o => o.children.length === 0);

		// Sort orphans by sequencing relationships (topological sort)
		const sortedOrphansWithChildren = this.sortOrphansBySequencing(orphansWithChildren);
		const sortedSimpleOrphans = this.sortOrphansBySequencing(simpleOrphans);

		// Position orphans with children first
		let currentX = 0;
		const startY = maxY + this.config.orphanGap;

		for (const orphan of sortedOrphansWithChildren) {
			const containerSize = orphan.containerSize || this.config.nodeSizes[orphan.type];

			orphan.position = {
				x: currentX,
				y: startY,
				width: this.config.nodeSizes[orphan.type].width,
				height: this.config.nodeSizes[orphan.type].height,
			};

			this.positionChildrenRecursive(orphan);
			currentX += containerSize.width + this.config.containerGap;
		}

		// Position simple orphans in a grid, respecting sequencing order
		if (sortedSimpleOrphans.length > 0) {
			const grid = this.calculateOptimalGrid(sortedSimpleOrphans);
			const simpleStartX = currentX > 0 ? currentX : 0;

			let maxWidth = 0;
			let maxHeight = 0;
			for (const orphan of sortedSimpleOrphans) {
				const size = this.config.nodeSizes[orphan.type];
				maxWidth = Math.max(maxWidth, size.width);
				maxHeight = Math.max(maxHeight, size.height);
			}

			for (let i = 0; i < sortedSimpleOrphans.length; i++) {
				const orphan = sortedSimpleOrphans[i];
				const col = i % grid.columns;
				const row = Math.floor(i / grid.columns);
				const nodeSize = this.config.nodeSizes[orphan.type];

				orphan.position = {
					x: simpleStartX + col * (maxWidth + this.config.childGap),
					y: startY + row * (maxHeight + this.config.childGap),
					width: nodeSize.width,
					height: nodeSize.height,
				};
			}
		}
	}

	/**
	 * Sort orphans by their sequencing relationships using topological sort.
	 * Entities that come BEFORE others (via blocks) appear first (lower X).
	 */
	private sortOrphansBySequencing(orphans: ProcessedNode[]): ProcessedNode[] {
		if (orphans.length <= 1) return orphans;

		const orphanIds = new Set(orphans.map(o => o.entityId));
		const graph = new Map<string, Set<string>>();
		const inDegree = new Map<string, number>();

		// Initialize
		for (const o of orphans) {
			graph.set(o.entityId, new Set());
			inDegree.set(o.entityId, 0);
		}

		// Build graph: edge from A to B means A comes BEFORE B
		// Only use sequencingAfter to avoid double-counting
		// (sequencingBefore is the inverse of sequencingAfter, so using both would count each edge twice)
		for (const o of orphans) {
			// sequencingAfter: this comes AFTER target (target -> this)
			for (const depId of o.sequencingAfter) {
				if (orphanIds.has(depId)) {
					// Only add edge if not already present (avoid duplicates)
					if (!graph.get(depId)!.has(o.entityId)) {
						graph.get(depId)!.add(o.entityId);
						inDegree.set(o.entityId, (inDegree.get(o.entityId) || 0) + 1);
					}
				}
			}
		}

		// Kahn's algorithm for topological sort
		const queue: string[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) queue.push(id);
		}

		const sorted: ProcessedNode[] = [];
		const orphanMap = new Map(orphans.map(o => [o.entityId, o]));

		while (queue.length > 0) {
			const id = queue.shift()!;
			sorted.push(orphanMap.get(id)!);

			for (const neighbor of graph.get(id) || []) {
				const newDegree = (inDegree.get(neighbor) || 0) - 1;
				inDegree.set(neighbor, newDegree);
				if (newDegree === 0) {
					queue.push(neighbor);
				}
			}
		}

		// If there are cycles, add remaining orphans at the end
		if (sorted.length < orphans.length) {
			for (const o of orphans) {
				if (!sorted.includes(o)) {
					sorted.push(o);
				}
			}
		}

		return sorted;
	}

	// ========================================================================
	// Phase 12: Resolve Overlaps
	// ========================================================================

	private resolveOverlaps(): void {
		console.log(`[PositioningV4] Phase 12: Resolving overlaps`);

		const allNodes: ProcessedNode[] = [];
		for (const node of this.processedNodes.values()) {
			if (node.position) allNodes.push(node);
		}

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
		const priorityOrder: EntityType[] = ['milestone', 'story', 'task', 'decision', 'document', 'feature'];
		const priorityA = priorityOrder.indexOf(nodeA.type);
		const priorityB = priorityOrder.indexOf(nodeB.type);

		const nodeToMove = priorityB >= priorityA ? nodeB : nodeA;
		const posToMove = nodeToMove.position!;
		const otherPos = nodeToMove === nodeB ? posA : posB;

		const overlapX = Math.min(
			otherPos.x + otherPos.width - posToMove.x,
			posToMove.x + posToMove.width - otherPos.x
		);
		const overlapY = Math.min(
			otherPos.y + otherPos.height - posToMove.y,
			posToMove.y + posToMove.height - otherPos.y
		);

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

		console.log(`[PositioningV4] Calculated positions for ${positions.size} nodes`);
		console.log(`[PositioningV4] Errors: ${this.errors.length}, Warnings: ${this.warnings.length}`);

		return {
			positions,
			errors: this.errors,
			warnings: this.warnings,
		};
	}
}

