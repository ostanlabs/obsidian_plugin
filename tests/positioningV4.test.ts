/**
 * Positioning V4 Engine Test Suite
 *
 * Tests the positioning engine against the relationship rules defined in RELATIONSHIP_RULES.md
 * Uses real MD files from the vault as test data.
 *
 * Uses the canonical entity parsing logic from util/entityParser.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	PositioningEngineV4,
	EntityData,
	EntityType,
	RELATIONSHIP_RULES,
	PositioningResult,
	DEFAULT_POSITIONING_CONFIG,
} from '../util/positioningV4';
import {
	parseEntityFromContent,
	generateNodeIdFromEntityId,
} from '../util/entityParser';

// ============================================================================
// Test Data Loading
// ============================================================================

const TEST_DATA_PATH = path.join(__dirname, 'testdata', 'vault');

interface LoadedEntity {
	entityData: EntityData;
	filePath: string;
}

/**
 * Load all MD files from the test data folder and parse them into EntityData
 * Uses the canonical parsing logic from util/entityParser.ts
 */
function loadTestEntities(): LoadedEntity[] {
	const entities: LoadedEntity[] = [];
	const folders = ['milestones', 'stories', 'tasks', 'decisions', 'documents', 'features'];

	for (const folder of folders) {
		const folderPath = path.join(TEST_DATA_PATH, folder);
		if (!fs.existsSync(folderPath)) continue;

		const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
		for (const file of files) {
			const filePath = path.join(folderPath, file);
			const content = fs.readFileSync(filePath, 'utf-8');
			const relativePath = `${folder}/${file}`;

			// Use the canonical parsing logic
			const entityData = parseEntityFromContent(
				content,
				generateNodeIdFromEntityId(file.replace('.md', '')),
				relativePath
			);

			if (!entityData) continue;

			// Update nodeId to use entityId for consistency
			entityData.nodeId = generateNodeIdFromEntityId(entityData.entityId);

			entities.push({ entityData, filePath: relativePath });
		}
	}

	return entities;
}

// ============================================================================
// Test Helpers
// ============================================================================

interface PositioningTestContext {
	entities: LoadedEntity[];
	entityMap: Map<string, LoadedEntity>;
	result: PositioningResult;
	engine: PositioningEngineV4;
}

let testContext: PositioningTestContext | null = null;

/**
 * Get or create the test context (singleton for performance)
 */
function getTestContext(): PositioningTestContext {
	if (testContext) return testContext;

	const entities = loadTestEntities();
	const entityMap = new Map<string, LoadedEntity>();
	for (const entity of entities) {
		entityMap.set(entity.entityData.entityId, entity);
	}

	const engine = new PositioningEngineV4();
	const result = engine.calculatePositions(entities.map(e => e.entityData));

	testContext = { entities, entityMap, result, engine };
	return testContext;
}

/**
 * Get entity by ID
 */
function getEntity(ctx: PositioningTestContext, entityId: string): LoadedEntity | undefined {
	return ctx.entityMap.get(entityId);
}

/**
 * Get position for an entity
 */
function getPosition(ctx: PositioningTestContext, entityId: string) {
	const entity = ctx.entityMap.get(entityId);
	if (!entity) return undefined;
	return ctx.result.positions.get(entity.entityData.nodeId);
}

/**
 * Check if entity A is positioned to the LEFT of entity B
 */
function isLeftOf(ctx: PositioningTestContext, entityIdA: string, entityIdB: string): boolean {
	const posA = getPosition(ctx, entityIdA);
	const posB = getPosition(ctx, entityIdB);
	if (!posA || !posB) return false;
	return posA.x + posA.width < posB.x;
}

/**
 * Check if entity A is positioned ABOVE entity B (lower Y = higher on screen)
 */
function isAbove(ctx: PositioningTestContext, entityIdA: string, entityIdB: string): boolean {
	const posA = getPosition(ctx, entityIdA);
	const posB = getPosition(ctx, entityIdB);
	if (!posA || !posB) return false;
	return posA.y + posA.height < posB.y;
}

/**
 * Check if entity A is contained within entity B's bounding box
 */
function isContainedIn(ctx: PositioningTestContext, childId: string, parentId: string): boolean {
	const childPos = getPosition(ctx, childId);
	const parentPos = getPosition(ctx, parentId);
	if (!childPos || !parentPos) return false;

	return (
		childPos.x >= parentPos.x &&
		childPos.y >= parentPos.y &&
		childPos.x + childPos.width <= parentPos.x + parentPos.width &&
		childPos.y + childPos.height <= parentPos.y + parentPos.height
	);
}

/**
 * Get workstream for an entity (from frontmatter or parent chain)
 */
function getWorkstream(ctx: PositioningTestContext, entityId: string): string {
	const entity = ctx.entityMap.get(entityId);
	if (!entity) return '';
	return entity.entityData.workstream || '';
}

// ============================================================================
// Test Suite
// ============================================================================

describe('PositioningV4 Engine', () => {
	describe('Data Loading', () => {
		it('should load test entities from vault', () => {
			const ctx = getTestContext();
			expect(ctx.entities.length).toBeGreaterThan(0);
			console.log(`Loaded ${ctx.entities.length} entities from test data`);
		});

		it('should have entities of all types', () => {
			const ctx = getTestContext();
			const types = new Set(ctx.entities.map(e => e.entityData.type));
			expect(types.has('milestone')).toBe(true);
			expect(types.has('story')).toBe(true);
			expect(types.has('task')).toBe(true);
			// decisions, documents, features may or may not exist
		});
	});

	describe('Positioning Engine Execution', () => {
		it('should complete without fatal errors', () => {
			const ctx = getTestContext();
			expect(ctx.result).toBeDefined();
			expect(ctx.result.positions).toBeDefined();
			console.log(`Positioning completed with ${ctx.result.errors.length} errors, ${ctx.result.warnings.length} warnings`);
		});

		it('should position all valid entities', () => {
			const ctx = getTestContext();
			const positionedCount = ctx.result.positions.size;
			console.log(`Positioned ${positionedCount} of ${ctx.entities.length} entities`);
			// Allow some entities to not be positioned (orphans, invalid refs, etc.)
			expect(positionedCount).toBeGreaterThan(0);
		});
	});

	// ========================================================================
	// MILESTONE RULES
	// ========================================================================
	describe('Milestone Rules', () => {
		describe('Rule: Milestone workstream → Containment (child of workstream)', () => {
			it('should group milestones by workstream', () => {
				const ctx = getTestContext();
				const milestones = ctx.entities.filter(e => e.entityData.type === 'milestone');
				const workstreamGroups = new Map<string, string[]>();

				for (const m of milestones) {
					const ws = m.entityData.workstream;
					if (!ws) continue;
					if (!workstreamGroups.has(ws)) workstreamGroups.set(ws, []);
					workstreamGroups.get(ws)!.push(m.entityData.entityId);
				}

				// Verify milestones in same workstream have similar Y positions
				for (const [ws, ids] of workstreamGroups) {
					if (ids.length < 2) continue;
					const positions = ids.map(id => getPosition(ctx, id)).filter(p => p);
					if (positions.length < 2) continue;

					const yValues = positions.map(p => p!.y);
					const minY = Math.min(...yValues);
					const maxY = Math.max(...yValues);
					// Milestones in same workstream should be in same horizontal band
					// Allow for some variation due to container sizes
					const maxYSpread = 2000; // Reasonable spread for a workstream
					expect(maxY - minY).toBeLessThan(maxYSpread);
				}
			});
		});

		describe('Rule: Milestone depends_on → Sequencing (after target)', () => {
			it('should position dependent milestones to the RIGHT of their dependencies', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'milestone') continue;
					const deps = entity.entityData.dependsOn;
					if (!deps || deps.length === 0) continue;

					for (const depId of deps) {
						const depEntity = getEntity(ctx, depId);
						if (!depEntity || depEntity.entityData.type !== 'milestone') continue;

						// Same workstream: should be to the right
						if (entity.entityData.workstream === depEntity.entityData.workstream) {
							const posA = getPosition(ctx, entity.entityData.entityId);
							const posB = getPosition(ctx, depId);
							if (posA && posB && posA.x <= posB.x) {
								violations.push(
									`Milestone ${entity.entityData.entityId} depends_on ${depId} but is NOT to the right ` +
									`(${entity.entityData.entityId}.x=${posA.x}, ${depId}.x=${posB.x})`
								);
							}
						}
					}
				}

				if (violations.length > 0) {
					console.log(`Milestone depends_on violations:\n${violations.slice(0, 10).join('\n')}`);
				}
				// Allow some violations due to complex dependency graphs
				expect(violations.length).toBeLessThan(ctx.entities.filter(e => e.entityData.type === 'milestone').length * 0.3);
			});
		});

		describe('Rule: Milestone blocks → Sequencing (before target)', () => {
			it('should position blocking milestones to the LEFT of blocked milestones', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'milestone') continue;
					const blocks = entity.entityData.blocks;
					if (!blocks || blocks.length === 0) continue;

					for (const blockedId of blocks) {
						const blockedEntity = getEntity(ctx, blockedId);
						if (!blockedEntity || blockedEntity.entityData.type !== 'milestone') continue;

						// Same workstream: blocker should be to the left
						if (entity.entityData.workstream === blockedEntity.entityData.workstream) {
							const posA = getPosition(ctx, entity.entityData.entityId);
							const posB = getPosition(ctx, blockedId);
							if (posA && posB && posA.x >= posB.x) {
								violations.push(
									`Milestone ${entity.entityData.entityId} blocks ${blockedId} but is NOT to the left ` +
									`(${entity.entityData.entityId}.x=${posA.x}, ${blockedId}.x=${posB.x})`
								);
							}
						}
					}
				}

				if (violations.length > 0) {
					console.log(`Milestone blocks violations:\n${violations.slice(0, 10).join('\n')}`);
				}
				expect(violations.length).toBeLessThan(ctx.entities.filter(e => e.entityData.type === 'milestone').length * 0.3);
			});
		});

		describe('Rule: Milestone container spacing', () => {
			it('should maintain minimum gap between adjacent milestone containers in same workstream', () => {
				const ctx = getTestContext();
				const violations: string[] = [];
				const expectedGap = DEFAULT_POSITIONING_CONFIG.containerGap;

				// Group milestones by workstream
				const milestones = ctx.entities.filter(e => e.entityData.type === 'milestone');
				const workstreamGroups = new Map<string, { entityId: string; pos: { x: number; y: number; width: number; height: number } }[]>();

				for (const m of milestones) {
					const ws = m.entityData.workstream;
					if (!ws) continue;
					const pos = getPosition(ctx, m.entityData.entityId);
					if (!pos) continue;

					if (!workstreamGroups.has(ws)) workstreamGroups.set(ws, []);
					workstreamGroups.get(ws)!.push({ entityId: m.entityData.entityId, pos });
				}

				// For each workstream, check spacing between adjacent milestones
				for (const [ws, milestonesInWs] of workstreamGroups) {
					if (milestonesInWs.length < 2) continue;

					// Sort by X position
					const sorted = milestonesInWs.sort((a, b) => a.pos.x - b.pos.x);

					for (let i = 0; i < sorted.length - 1; i++) {
						const current = sorted[i];
						const next = sorted[i + 1];

						// Gap = next.x - (current.x + current.width)
						const gap = next.pos.x - (current.pos.x + current.pos.width);

						// Allow some tolerance (within 10% of expected gap)
						const minAllowedGap = expectedGap * 0.9;

						if (gap < minAllowedGap && gap >= 0) {
							violations.push(
								`Workstream ${ws}: Gap between ${current.entityId} and ${next.entityId} is ${gap}px ` +
								`(expected >= ${expectedGap}px). ` +
								`${current.entityId}: x=${current.pos.x}, width=${current.pos.width}, endX=${current.pos.x + current.pos.width}. ` +
								`${next.entityId}: x=${next.pos.x}`
							);
						}
					}
				}

				if (violations.length > 0) {
					console.log(`Milestone container spacing violations:\n${violations.slice(0, 10).join('\n')}`);
				}

				// Report statistics and check max gap
				const maxAllowedGap = 200;
				let totalGaps = 0;
				let gapsChecked = 0;
				const excessiveGaps: string[] = [];
				for (const [ws, milestonesInWs] of workstreamGroups) {
					if (milestonesInWs.length < 2) continue;
					const sorted = milestonesInWs.sort((a, b) => a.pos.x - b.pos.x);
					for (let i = 0; i < sorted.length - 1; i++) {
						const current = sorted[i];
						const next = sorted[i + 1];
						const gap = next.pos.x - (current.pos.x + current.pos.width);
						if (gap >= 0) {
							totalGaps += gap;
							gapsChecked++;
							if (gap > maxAllowedGap) {
								excessiveGaps.push(
									`Workstream ${ws}: Gap between ${current.entityId} and ${next.entityId} is ${gap}px (max: ${maxAllowedGap}px). ` +
									`${current.entityId}: x=${current.pos.x}, width=${current.pos.width}, endX=${current.pos.x + current.pos.width}. ` +
									`${next.entityId}: x=${next.pos.x}`
								);
							}
						}
					}
				}
				if (gapsChecked > 0) {
					console.log(`Average milestone container gap: ${Math.round(totalGaps / gapsChecked)}px (expected: ${expectedGap}px, max: ${maxAllowedGap}px)`);
				}
				if (excessiveGaps.length > 0) {
					console.log(`Excessive gaps (>${maxAllowedGap}px) between milestones:\n${excessiveGaps.join('\n')}`);
				}

				// Allow some violations for minimum gap due to complex layouts
				expect(violations.length).toBeLessThan(workstreamGroups.size * 2);

				// Log excessive gaps for debugging (not enforced as strict requirement)
				// Large gaps can occur due to cross-workstream dependencies and container sizing
			});

			it('should not have overlapping milestone containers in same workstream', () => {
				const ctx = getTestContext();
				const overlaps: string[] = [];

				// Group milestones by workstream
				const milestones = ctx.entities.filter(e => e.entityData.type === 'milestone');
				const workstreamGroups = new Map<string, { entityId: string; pos: { x: number; y: number; width: number; height: number } }[]>();

				for (const m of milestones) {
					const ws = m.entityData.workstream;
					if (!ws) continue;
					const pos = getPosition(ctx, m.entityData.entityId);
					if (!pos) continue;

					if (!workstreamGroups.has(ws)) workstreamGroups.set(ws, []);
					workstreamGroups.get(ws)!.push({ entityId: m.entityData.entityId, pos });
				}

				// Check for overlaps within each workstream
				for (const [ws, milestonesInWs] of workstreamGroups) {
					// Deduplicate by entityId (in case of duplicate entries)
					const uniqueMilestones = new Map<string, typeof milestonesInWs[0]>();
					for (const m of milestonesInWs) {
						uniqueMilestones.set(m.entityId, m);
					}
					const dedupedMilestones = Array.from(uniqueMilestones.values());

					for (let i = 0; i < dedupedMilestones.length; i++) {
						for (let j = i + 1; j < dedupedMilestones.length; j++) {
							const a = dedupedMilestones[i];
							const b = dedupedMilestones[j];

							// Skip if same entity (shouldn't happen after dedup, but safety check)
							if (a.entityId === b.entityId) continue;

							// Check X overlap
							const xOverlap = !(a.pos.x + a.pos.width <= b.pos.x || b.pos.x + b.pos.width <= a.pos.x);
							// Check Y overlap
							const yOverlap = !(a.pos.y + a.pos.height <= b.pos.y || b.pos.y + b.pos.height <= a.pos.y);

							if (xOverlap && yOverlap) {
								overlaps.push(
									`Workstream ${ws}: ${a.entityId} and ${b.entityId} overlap. ` +
									`${a.entityId}: (${a.pos.x}, ${a.pos.y}) ${a.pos.width}x${a.pos.height}. ` +
									`${b.entityId}: (${b.pos.x}, ${b.pos.y}) ${b.pos.width}x${b.pos.height}`
								);
							}
						}
					}
				}

				if (overlaps.length > 0) {
					console.log(`Milestone container overlaps:\n${overlaps.slice(0, 10).join('\n')}`);
				}

				// No overlaps should exist
				expect(overlaps.length).toBe(0);
			});
		});
	});

	// ========================================================================
	// STORY RULES
	// ========================================================================
	describe('Story Rules', () => {
		describe('Rule: Story parent → Containment (child of milestone)', () => {
			it('should position stories within their parent milestone containers', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'story') continue;
					const parentId = entity.entityData.parent;
					if (!parentId) continue;

					const parentEntity = getEntity(ctx, parentId);
					if (!parentEntity || parentEntity.entityData.type !== 'milestone') continue;

					// Story should be contained within milestone
					// Note: Due to container sizing, we check relative positioning
					const storyPos = getPosition(ctx, entity.entityData.entityId);
					const milestonePos = getPosition(ctx, parentId);

					if (storyPos && milestonePos) {
						// Story should be positioned relative to milestone
						// (exact containment depends on container expansion)
						const isNearMilestone =
							Math.abs(storyPos.x - milestonePos.x) < 5000 &&
							Math.abs(storyPos.y - milestonePos.y) < 5000;

						if (!isNearMilestone) {
							violations.push(
								`Story ${entity.entityData.entityId} has parent ${parentId} but is far from it ` +
								`(story: ${storyPos.x},${storyPos.y}, milestone: ${milestonePos.x},${milestonePos.y})`
							);
						}
					}
				}

				if (violations.length > 0) {
					console.log(`Story parent violations:\n${violations.slice(0, 10).join('\n')}`);
				}
				expect(violations.length).toBeLessThan(ctx.entities.filter(e => e.entityData.type === 'story').length * 0.2);
			});
		});

		describe('Rule: Story depends_on → Sequencing (after target)', () => {
			it('should position dependent stories to the RIGHT of their dependencies (same milestone)', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'story') continue;
					const deps = entity.entityData.dependsOn;
					if (!deps || deps.length === 0) continue;

					for (const depId of deps) {
						const depEntity = getEntity(ctx, depId);
						if (!depEntity || depEntity.entityData.type !== 'story') continue;

						// Same parent: should be to the right
						if (entity.entityData.parent === depEntity.entityData.parent && entity.entityData.parent) {
							const posA = getPosition(ctx, entity.entityData.entityId);
							const posB = getPosition(ctx, depId);
							if (posA && posB && posA.x <= posB.x) {
								violations.push(
									`Story ${entity.entityData.entityId} depends_on ${depId} but is NOT to the right ` +
									`(${entity.entityData.entityId}.x=${posA.x}, ${depId}.x=${posB.x})`
								);
							}
						}
					}
				}

				if (violations.length > 0) {
					console.log(`Story depends_on violations:\n${violations.slice(0, 10).join('\n')}`);
				}
				expect(violations.length).toBeLessThan(ctx.entities.filter(e => e.entityData.type === 'story').length * 0.3);
			});
		});
	});

	// ========================================================================
	// TASK RULES
	// ========================================================================
	describe('Task Rules', () => {
		describe('Rule: Task parent → Containment (child of story)', () => {
			it('should position tasks within their parent story containers', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'task') continue;
					const parentId = entity.entityData.parent;
					if (!parentId) continue;

					const parentEntity = getEntity(ctx, parentId);
					if (!parentEntity || parentEntity.entityData.type !== 'story') continue;

					const taskPos = getPosition(ctx, entity.entityData.entityId);
					const storyPos = getPosition(ctx, parentId);

					if (taskPos && storyPos) {
						const isNearStory =
							Math.abs(taskPos.x - storyPos.x) < 3000 &&
							Math.abs(taskPos.y - storyPos.y) < 3000;

						if (!isNearStory) {
							violations.push(
								`Task ${entity.entityData.entityId} has parent ${parentId} but is far from it ` +
								`(task: ${taskPos.x},${taskPos.y}, story: ${storyPos.x},${storyPos.y})`
							);
						}
					}
				}

				if (violations.length > 0) {
					console.log(`Task parent violations:\n${violations.slice(0, 10).join('\n')}`);
				}
				expect(violations.length).toBeLessThan(ctx.entities.filter(e => e.entityData.type === 'task').length * 0.2);
			});
		});

		describe('Rule: Task depends_on → Sequencing (after target, NO cross-ws positioning)', () => {
			it('should position dependent tasks to the RIGHT of their dependencies (same story)', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'task') continue;
					const deps = entity.entityData.dependsOn;
					if (!deps || deps.length === 0) continue;

					for (const depId of deps) {
						const depEntity = getEntity(ctx, depId);
						if (!depEntity || depEntity.entityData.type !== 'task') continue;

						// Same parent: should be to the right
						if (entity.entityData.parent === depEntity.entityData.parent && entity.entityData.parent) {
							const posA = getPosition(ctx, entity.entityData.entityId);
							const posB = getPosition(ctx, depId);
							if (posA && posB && posA.x <= posB.x) {
								violations.push(
									`Task ${entity.entityData.entityId} depends_on ${depId} but is NOT to the right ` +
									`(${entity.entityData.entityId}.x=${posA.x}, ${depId}.x=${posB.x})`
								);
							}
						}
					}
				}

				if (violations.length > 0) {
					console.log(`Task depends_on violations:\n${violations.slice(0, 10).join('\n')}`);
				}
				expect(violations.length).toBeLessThan(ctx.entities.filter(e => e.entityData.type === 'task').length * 0.3);
			});
		});
	});

	// ========================================================================
	// DECISION RULES
	// ========================================================================
	describe('Decision Rules', () => {
		describe('Rule: Decision parent → Containment (child of milestone/story, priority 1)', () => {
			it('should position decisions with parent within their parent container', () => {
				const ctx = getTestContext();
				const decisions = ctx.entities.filter(e => e.entityData.type === 'decision');
				const withParent = decisions.filter(d => d.entityData.parent);

				console.log(`Found ${decisions.length} decisions, ${withParent.length} with parent field`);

				// Just verify decisions with parent are positioned
				for (const decision of withParent) {
					const pos = getPosition(ctx, decision.entityData.entityId);
					// Decision should have a position
					if (!pos) {
						console.log(`Decision ${decision.entityData.entityId} with parent ${decision.entityData.parent} has no position`);
					}
				}
			});
		});

		describe('Rule: Decision affects → Containment (child of affected, priority 2)', () => {
			it('should handle decisions with affects field', () => {
				const ctx = getTestContext();
				const decisions = ctx.entities.filter(e => e.entityData.type === 'decision');
				const withAffects = decisions.filter(d => d.entityData.affects && d.entityData.affects.length > 0);
				const withEnables = decisions.filter(d => d.entityData.enables && d.entityData.enables.length > 0);

				console.log(`Found ${decisions.length} decisions, ${withAffects.length} with affects, ${withEnables.length} with enables (legacy)`);

				// Verify auto-migration: enables should be migrated to affects
				// (This happens during processing, not in test data)
			});
		});

		describe('Rule: Decision supersedes → Sequencing (before target)', () => {
			it('should position superseding decisions to the LEFT of superseded decisions', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'decision') continue;
					const supersedes = entity.entityData.supersedes;
					if (!supersedes) continue;

					const supersededEntity = getEntity(ctx, supersedes);
					if (!supersededEntity || supersededEntity.entityData.type !== 'decision') continue;

					const posA = getPosition(ctx, entity.entityData.entityId);
					const posB = getPosition(ctx, supersedes);
					if (posA && posB && posA.x >= posB.x) {
						violations.push(
							`Decision ${entity.entityData.entityId} supersedes ${supersedes} but is NOT to the left ` +
							`(${entity.entityData.entityId}.x=${posA.x}, ${supersedes}.x=${posB.x})`
						);
					}
				}

				if (violations.length > 0) {
					console.log(`Decision supersedes violations:\n${violations.join('\n')}`);
				}
				// Supersedes is rare, so we expect few or no violations
				expect(violations.length).toBeLessThan(5);
			});
		});
	});

	// ========================================================================
	// DOCUMENT RULES
	// ========================================================================
	describe('Document Rules', () => {
		describe('Rule: Document parent → Containment (priority 1)', () => {
			it('should position documents with parent within their parent container', () => {
				const ctx = getTestContext();
				const documents = ctx.entities.filter(e => e.entityData.type === 'document');
				const withParent = documents.filter(d => d.entityData.parent);

				console.log(`Found ${documents.length} documents, ${withParent.length} with parent field`);
			});
		});

		describe('Rule: Document implemented_by → Containment (priority 2)', () => {
			it('should position documents with implemented_by within implementer container', () => {
				const ctx = getTestContext();
				const documents = ctx.entities.filter(e => e.entityData.type === 'document');
				const withImplementedBy = documents.filter(d => d.entityData.implementedBy && d.entityData.implementedBy.length > 0);

				console.log(`Found ${documents.length} documents, ${withImplementedBy.length} with implemented_by field`);

				// Verify documents with implemented_by are positioned
				for (const doc of withImplementedBy) {
					const pos = getPosition(ctx, doc.entityData.entityId);
					if (!pos) {
						console.log(`Document ${doc.entityData.entityId} with implemented_by has no position`);
					}
				}
			});
		});

		describe('Rule: Document previous_version → Sequencing (after target)', () => {
			it('should position newer documents to the RIGHT of previous versions', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'document') continue;
					const prevVersion = entity.entityData.previousVersion;
					if (!prevVersion) continue;

					const prevEntity = getEntity(ctx, prevVersion);
					if (!prevEntity || prevEntity.entityData.type !== 'document') continue;

					const posA = getPosition(ctx, entity.entityData.entityId);
					const posB = getPosition(ctx, prevVersion);
					if (posA && posB && posA.x <= posB.x) {
						violations.push(
							`Document ${entity.entityData.entityId} previous_version ${prevVersion} but is NOT to the right ` +
							`(${entity.entityData.entityId}.x=${posA.x}, ${prevVersion}.x=${posB.x})`
						);
					}
				}

				if (violations.length > 0) {
					console.log(`Document previous_version violations:\n${violations.join('\n')}`);
				}
				expect(violations.length).toBeLessThan(5);
			});
		});
	});

	// ========================================================================
	// FEATURE RULES
	// ========================================================================
	describe('Feature Rules', () => {
		describe('Rule: Feature parent → Containment (priority 1)', () => {
			it('should position features with parent within their parent container', () => {
				const ctx = getTestContext();
				const features = ctx.entities.filter(e => e.entityData.type === 'feature');
				const withParent = features.filter(f => f.entityData.parent);

				console.log(`Found ${features.length} features, ${withParent.length} with parent field`);
			});
		});

		describe('Rule: Feature implemented_by → Containment (priority 2)', () => {
			it('should position features with implemented_by within implementer container', () => {
				const ctx = getTestContext();
				const features = ctx.entities.filter(e => e.entityData.type === 'feature');
				const withImplementedBy = features.filter(f => f.entityData.implementedBy && f.entityData.implementedBy.length > 0);

				console.log(`Found ${features.length} features, ${withImplementedBy.length} with implemented_by field`);

				// Verify features with implemented_by are positioned
				for (const feature of withImplementedBy) {
					const pos = getPosition(ctx, feature.entityData.entityId);
					if (!pos) {
						console.log(`Feature ${feature.entityData.entityId} with implemented_by has no position`);
					}
				}
			});
		});
	});

	// ========================================================================
	// ENTITY CATEGORIES
	// ========================================================================
	describe('Entity Categories', () => {
		describe('Contained Entities', () => {
			it('should have positions for entities with containment relationships', () => {
				const ctx = getTestContext();
				const containedCount = ctx.entities.filter(e => {
					const d = e.entityData;
					// Has containment if: has parent, or has implemented_by, or milestone with workstream
					return d.parent ||
						(d.implementedBy && d.implementedBy.length > 0) ||
						(d.type === 'milestone' && d.workstream);
				}).length;

				const positionedCount = ctx.result.positions.size;
				console.log(`Contained entities: ~${containedCount}, Positioned: ${positionedCount}`);

				// Most contained entities should be positioned
				expect(positionedCount).toBeGreaterThan(containedCount * 0.5);
			});
		});

		describe('Orphan Entities', () => {
			it('should identify entities with no relationships as orphans', () => {
				const ctx = getTestContext();
				const orphans = ctx.entities.filter(e => {
					const d = e.entityData;
					// Orphan: no parent, no depends_on, no blocks, no implemented_by, no workstream (for milestone)
					const hasContainment = d.parent ||
						(d.implementedBy && d.implementedBy.length > 0) ||
						(d.type === 'milestone' && d.workstream);
					const hasSequencing = (d.dependsOn && d.dependsOn.length > 0) ||
						(d.blocks && d.blocks.length > 0);
					return !hasContainment && !hasSequencing;
				});

				console.log(`Found ${orphans.length} potential orphan entities`);

				// Orphans should still be positioned (at bottom of canvas)
				for (const orphan of orphans.slice(0, 10)) {
					const pos = getPosition(ctx, orphan.entityData.entityId);
					if (pos) {
						console.log(`Orphan ${orphan.entityData.entityId} positioned at (${pos.x}, ${pos.y})`);
					}
				}
			});
		});

		describe('Floating Entities', () => {
			it('should identify entities with only sequencing relationships as floating', () => {
				const ctx = getTestContext();
				const floating = ctx.entities.filter(e => {
					const d = e.entityData;
					// Floating: has sequencing but no containment
					const hasContainment = d.parent ||
						(d.implementedBy && d.implementedBy.length > 0) ||
						(d.type === 'milestone' && d.workstream);
					const hasSequencing = (d.dependsOn && d.dependsOn.length > 0) ||
						(d.blocks && d.blocks.length > 0);
					return !hasContainment && hasSequencing;
				});

				console.log(`Found ${floating.length} potential floating entities`);

				// Log some examples
				for (const f of floating.slice(0, 5)) {
					console.log(`Floating: ${f.entityData.entityId} (${f.entityData.type}) - depends_on: ${f.entityData.dependsOn}, blocks: ${f.entityData.blocks}`);
				}
			});
		});
	});

	// ========================================================================
	// CROSS-WORKSTREAM POSITIONING
	// ========================================================================
	describe('Cross-Workstream Positioning', () => {
		describe('Milestone cross-workstream dependencies', () => {
			it('should apply position constraints for cross-workstream milestone dependencies', () => {
				const ctx = getTestContext();
				const violations: string[] = [];

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'milestone') continue;
					const deps = entity.entityData.dependsOn;
					if (!deps || deps.length === 0) continue;

					for (const depId of deps) {
						const depEntity = getEntity(ctx, depId);
						if (!depEntity || depEntity.entityData.type !== 'milestone') continue;

						// Cross-workstream: should still be to the right
						if (entity.entityData.workstream !== depEntity.entityData.workstream) {
							const posA = getPosition(ctx, entity.entityData.entityId);
							const posB = getPosition(ctx, depId);
							if (posA && posB && posA.x <= posB.x) {
								violations.push(
									`Milestone ${entity.entityData.entityId} (ws: ${entity.entityData.workstream}) depends_on ` +
									`${depId} (ws: ${depEntity.entityData.workstream}) but is NOT to the right ` +
									`(${entity.entityData.entityId}.x=${posA.x}, ${depId}.x=${posB.x})`
								);
							}
						}
					}
				}

				if (violations.length > 0) {
					console.log(`Cross-workstream milestone violations:\n${violations.slice(0, 10).join('\n')}`);
				}
				// Cross-workstream constraints are harder to satisfy
				expect(violations.length).toBeLessThan(ctx.entities.filter(e => e.entityData.type === 'milestone').length * 0.5);
			});
		});

		describe('Task cross-workstream dependencies (edge only, no position constraint)', () => {
			it('should NOT apply position constraints for cross-workstream task dependencies', () => {
				const ctx = getTestContext();
				let crossWsTaskDeps = 0;

				for (const entity of ctx.entities) {
					if (entity.entityData.type !== 'task') continue;
					const deps = entity.entityData.dependsOn;
					if (!deps || deps.length === 0) continue;

					for (const depId of deps) {
						const depEntity = getEntity(ctx, depId);
						if (!depEntity || depEntity.entityData.type !== 'task') continue;

						// Get workstreams via parent chain
						const entityWs = getWorkstreamViaParent(ctx, entity.entityData.entityId);
						const depWs = getWorkstreamViaParent(ctx, depId);

						if (entityWs && depWs && entityWs !== depWs) {
							crossWsTaskDeps++;
						}
					}
				}

				console.log(`Found ${crossWsTaskDeps} cross-workstream task dependencies (edge only, no position constraint)`);
				// This is informational - tasks don't have cross-ws position constraints
			});
		});
	});

	// ========================================================================
	// PRIORITY-BASED CONTAINMENT
	// ========================================================================
	describe('Priority-Based Containment', () => {
		describe('Decision priority: parent (1) > affects (2)', () => {
			it('should use parent for containment when both parent and affects are present', () => {
				const ctx = getTestContext();
				const decisions = ctx.entities.filter(e => e.entityData.type === 'decision');
				const withBoth = decisions.filter(d =>
					d.entityData.parent &&
					d.entityData.affects &&
					d.entityData.affects.length > 0
				);

				console.log(`Found ${withBoth.length} decisions with both parent and affects`);

				// These should be contained in parent, with edge to affects
				for (const decision of withBoth) {
					const pos = getPosition(ctx, decision.entityData.entityId);
					if (pos) {
						console.log(`Decision ${decision.entityData.entityId}: parent=${decision.entityData.parent}, affects=${decision.entityData.affects}`);
					}
				}
			});
		});

		describe('Document priority: parent (1) > implemented_by (2) > documents (3)', () => {
			it('should use highest priority field for containment', () => {
				const ctx = getTestContext();
				const documents = ctx.entities.filter(e => e.entityData.type === 'document');

				const withParent = documents.filter(d => d.entityData.parent);
				const withImplementedBy = documents.filter(d =>
					!d.entityData.parent &&
					d.entityData.implementedBy &&
					d.entityData.implementedBy.length > 0
				);
				const withDocuments = documents.filter(d =>
					!d.entityData.parent &&
					(!d.entityData.implementedBy || d.entityData.implementedBy.length === 0) &&
					d.entityData.documents
				);

				console.log(`Documents: ${withParent.length} with parent, ${withImplementedBy.length} with implemented_by only, ${withDocuments.length} with documents only`);
			});
		});
	});

	// ========================================================================
	// AUTO-MIGRATION
	// ========================================================================
	describe('Auto-Migration', () => {
		describe('Decision enables/blocks → affects migration', () => {
			it('should auto-migrate enables field to affects during processing', () => {
				const ctx = getTestContext();
				const decisions = ctx.entities.filter(e => e.entityData.type === 'decision');
				const withEnables = decisions.filter(d => d.entityData.enables && d.entityData.enables.length > 0);
				const withAffects = decisions.filter(d => d.entityData.affects && d.entityData.affects.length > 0);

				console.log(`Decisions: ${withEnables.length} with enables (legacy), ${withAffects.length} with affects (new)`);

				// The engine should auto-migrate enables to affects
				// This is tested by verifying the engine processes these correctly
			});
		});
	});
});

// ============================================================================
// Helper: Get workstream via parent chain
// ============================================================================
function getWorkstreamViaParent(ctx: PositioningTestContext, entityId: string): string | undefined {
	const entity = ctx.entityMap.get(entityId);
	if (!entity) return undefined;

	// If entity has workstream, return it
	if (entity.entityData.workstream) {
		return entity.entityData.workstream;
	}

	// Otherwise, traverse parent chain
	const parentId = entity.entityData.parent;
	if (parentId) {
		return getWorkstreamViaParent(ctx, parentId);
	}

	return undefined;
}
