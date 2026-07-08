/**
 * Phase 1 mapper-layer tests (docs/ENTITY_MODEL_CONVERGENCE_SPEC.md §6 Phase 1).
 *
 * Covers src/adapters/model-map.ts:
 *   1. Parity — for a corpus of frontmatter fixtures (extended from
 *      frontmatterRoundTrip.test.ts), EntityParser.parse → toEntityData yields
 *      the same field values the legacy util/entityParser
 *      parseEntityFromFrontmatter produces.
 *   2. Reconciled defaults (spec §5.3) — literal unknown type (no 'task'
 *      coercion), schema default workstream 'engineering' (no 'default' /
 *      legacy `effort` fallback).
 *   3. Round-trip — fromItemFrontmatter → toItemFrontmatter preserves all
 *      fields incl. inProgress / created_by_plugin / notion_page_id.
 *   4. priority synthesis — entity without priority → 'Medium' (the schema's
 *      own default and the only casing ItemPriority admits).
 *   5. camelCase bridge — every pair in positioningV4 getFieldValue's map
 *      (depends_on→dependsOn, implemented_by→implementedBy,
 *      previous_version→previousVersion, documented_by→documentedBy,
 *      decided_by→decidedBy) is exercised.
 *   6. fromFrontmatterObject ≡ EntityParser.parse (schema-driven routing,
 *      no hardcoded relationship lists).
 */
import { EntityParser } from '../src/entity-core/parser';
import { SchemaRegistry } from '../src/entity-core/schema-registry';
import { DEFAULT_SCHEMA } from '../src/entity-core/default-schema';
import type { RuntimeEntity } from '../src/entity-core/types';
import {
	toEntityData,
	toItemFrontmatter,
	toFeatureFrontmatter,
	fromItemFrontmatter,
	fromFeatureFrontmatter,
	fromFrontmatterObject,
	DEFAULT_PRIORITY,
} from '../src/adapters/model-map';
import {
	parseEntityFromContent,
	generateNodeIdFromEntityId,
} from '../util/entityParser';
import { createWithFrontmatter, updateFrontmatter } from '../util/frontmatter';
import type { ItemFrontmatter, FeatureFrontmatter } from '../types';

type FM = Record<string, unknown>;

const BODY = '\n# Heading\n\nSome body text with a : colon and #hash.\n';

const schema = new SchemaRegistry(DEFAULT_SCHEMA);
const parser = new EntityParser(schema);

/**
 * Corpus: the frontmatterRoundTrip fixtures (one per type, with relationship
 * arrays, plugin-only fields, special characters) extended with scalar
 * relationship fixtures (parent, supersedes, previous_version) and a
 * deprecated-`enables` fixture so every EntityData field is exercised.
 */
const CORPUS: Array<{ name: string; fm: FM }> = [
	{
		name: 'task',
		fm: {
			type: 'task',
			id: 'T-001',
			title: 'Component 3: Config Loader',
			workstream: 'engineering',
			status: 'In Progress',
			priority: 'High',
			inProgress: true,
			created_by_plugin: true,
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-02T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'tasks/T-001.md',
			notion_page_id: 'abc-123',
			depends_on: ['T-002', 'S-1'],
			blocks: ['T-009'],
		},
	},
	{
		name: 'task with parent',
		fm: {
			type: 'task',
			id: 'T-005',
			title: 'Child task',
			workstream: 'engineering',
			status: 'Not Started',
			priority: 'Low',
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'tasks/T-005.md',
			parent: 'S-010',
			depends_on: ['T-001'],
		},
	},
	{
		name: 'story',
		fm: {
			type: 'story',
			id: 'S-010',
			title: 'Quote "test" in the title',
			workstream: 'default',
			status: 'Not Started',
			priority: 'Medium',
			inProgress: false,
			created_by_plugin: true,
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'stories/S-010.md',
			depends_on: [],
			implements: ['F-001'],
		},
	},
	{
		name: 'story with deprecated enables',
		fm: {
			type: 'story',
			id: 'S-020',
			title: 'Legacy enables carrier',
			workstream: 'engineering',
			status: 'Not Started',
			priority: 'Medium',
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'stories/S-020.md',
			parent: 'M-002',
			enables: ['S-011', 'S-012'],
		},
	},
	{
		name: 'milestone',
		fm: {
			type: 'milestone',
			id: 'M-002',
			title: 'Ship MVP # 1',
			workstream: 'engineering',
			status: 'Not Started',
			priority: 'Critical',
			created_by_plugin: true,
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'milestones/M-002.md',
			depends_on: ['M-001'],
			implements: ['F-001', 'F-002'],
		},
	},
	{
		name: 'decision',
		fm: {
			type: 'decision',
			id: 'DEC-003',
			title: 'Adopt EntitySerializer: rationale',
			workstream: 'architecture',
			status: 'Accepted',
			priority: 'High',
			created_by_plugin: true,
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'decisions/DEC-003.md',
			affects: ['F-001', 'DOC-002', 'S-010'],
		},
	},
	{
		name: 'decision with supersedes',
		fm: {
			type: 'decision',
			id: 'DEC-004',
			title: 'Supersede the old call',
			workstream: 'architecture',
			status: 'Decided',
			priority: 'Medium',
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'decisions/DEC-004.md',
			supersedes: 'DEC-001',
			affects: ['DOC-002'],
		},
	},
	{
		name: 'document',
		fm: {
			type: 'document',
			id: 'DOC-002',
			title: 'Design: Unification Spec',
			workstream: 'docs',
			status: 'Draft',
			priority: 'Low',
			created_by_plugin: true,
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'docs/DOC-002.md',
			documents: ['F-001'],
		},
	},
	{
		name: 'document with previous_version + decided_by',
		fm: {
			type: 'document',
			id: 'DOC-003',
			title: 'Spec v2',
			workstream: 'docs',
			status: 'Review',
			priority: 'Medium',
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			canvas_source: 'board.canvas',
			vault_path: 'docs/DOC-003.md',
			documents: ['F-001'],
			previous_version: 'DOC-001',
			decided_by: ['DEC-003'],
		},
	},
	{
		name: 'feature',
		fm: {
			type: 'feature',
			id: 'F-001',
			title: 'Configurable Schema: multi-type',
			workstream: 'engineering',
			user_story: 'As a user, I want X, so that Y: done.',
			tier: 'Premium',
			phase: '1',
			status: 'In Progress',
			priority: 'High',
			created_by_plugin: true,
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
			personas: ['admin', 'power-user'],
			acceptance_criteria: ['Given: a vault', 'When: reformatted'],
			test_refs: ['tests/frontmatter.test.ts'],
			implemented_by: ['M-002', 'S-010'],
			documented_by: ['DOC-002'],
			decided_by: ['DEC-003'],
			depends_on: [],
			blocks: ['F-002'],
		},
	},
];

/** Serialize a fixture the way the plugin writes files today (create path —
 * injects the always-include keys parent/notion_page_id/created_by_plugin/
 * depends_on even when empty). */
function contentOf(fm: FM): string {
	return createWithFrontmatter(BODY, fm as Partial<ItemFrontmatter>);
}

/** Serialize EXACTLY the fixture's keys (canonical format, no injected keys) —
 * for tests comparing key-for-key against object construction. */
function exactContentOf(fm: FM): string {
	const base = `---\ntype: "${fm.type}"\nid: "${fm.id}"\n---\n${BODY}`;
	return updateFrontmatter(base, fm as Partial<ItemFrontmatter>);
}

/** Minimal RuntimeEntity factory for direct-construction tests. */
function makeEntity(partial: Partial<RuntimeEntity>): RuntimeEntity {
	return {
		id: 'T-900',
		type: 'task',
		title: 'Synthetic',
		status: 'Not Started',
		workstream: 'engineering',
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
		archived: false,
		vault_path: 'tasks/T-900.md',
		canvas_source: 'board.canvas',
		fields: {},
		relationships: {},
		...partial,
	};
}

// =============================================================================
// 1. Parity: EntityParser.parse → toEntityData ≡ legacy parseEntityFromFrontmatter
// =============================================================================

describe('toEntityData parity with util/entityParser (known type + workstream corpus)', () => {
	for (const entry of CORPUS) {
		it(`matches the legacy positioning projection for ${entry.name}`, () => {
			const filePath = String(entry.fm.vault_path);
			const nodeId = generateNodeIdFromEntityId(String(entry.fm.id));
			const content = contentOf(entry.fm);

			const legacy = parseEntityFromContent(content, nodeId, filePath);
			expect(legacy).not.toBeNull();

			const runtime = parser.parse(content, filePath);
			const projected = toEntityData(runtime, filePath, nodeId);

			// Compare exactly the fields the legacy parser produces (the
			// projection may carry extra bridge fields like documentedBy).
			const picked: FM = {};
			for (const key of Object.keys(legacy!)) {
				picked[key] = (projected as unknown as FM)[key];
			}
			expect(picked).toEqual(legacy as unknown as FM);
		});
	}

	it('derives the default nodeId via generateNodeIdFromEntityId', () => {
		const runtime = makeEntity({ id: 'M-042' });
		const projected = toEntityData(runtime);
		expect(projected.nodeId).toBe(generateNodeIdFromEntityId('M-042'));
		expect(projected.nodeId).toBe('node-M-042');
	});

	it('uses filePath argument when given, else entity.vault_path', () => {
		const runtime = makeEntity({ vault_path: 'tasks/T-900.md' });
		expect(toEntityData(runtime).filePath).toBe('tasks/T-900.md');
		expect(toEntityData(runtime, 'elsewhere/T-900.md').filePath).toBe('elsewhere/T-900.md');
	});

	it('lowercases the workstream lane like the legacy parser', () => {
		const runtime = makeEntity({ workstream: 'Engineering' });
		expect(toEntityData(runtime).workstream).toBe('engineering');
	});
});

// =============================================================================
// 2. Reconciled defaults (spec §5.3) — deliberately NOT the legacy coercions
// =============================================================================

describe('reconciled parser defaults (spec §5.3 — entity-core semantics)', () => {
	it('preserves the literal unknown type (legacy parser coerced → task)', () => {
		const content = [
			'---',
			'type: epic',
			'id: E-001',
			'title: Unknown type carrier',
			'workstream: engineering',
			'depends_on:',
			'  - T-001',
			'---',
			BODY,
		].join('\n');

		// Legacy behavior (pinned here as the OLD contract): coerces to task.
		const legacy = parseEntityFromContent(content, 'node-E-001', 'epics/E-001.md');
		expect(legacy!.type).toBe('task');

		// Converged behavior: literal type survives for the validator to judge.
		const runtime = parser.parse(content, 'epics/E-001.md');
		const projected = toEntityData(runtime, 'epics/E-001.md');
		expect(projected.type).toBe('epic');
		// Relationship-shaped keys on a schema-less type ride passthrough and
		// are still projected (layout parity with the untyped legacy reader).
		expect(projected.dependsOn).toEqual(['T-001']);
	});

	it("defaults a missing workstream to the schema default 'engineering' (not 'default')", () => {
		const content = ['---', 'type: task', 'id: T-100', 'title: No workstream', '---', BODY].join('\n');
		const runtime = parser.parse(content, 'tasks/T-100.md');
		expect(toEntityData(runtime, 'tasks/T-100.md').workstream).toBe('engineering');
	});

	it('ignores the legacy `effort` fallback — schema default wins', () => {
		const content = ['---', 'type: task', 'id: T-101', 'title: Effort only', 'effort: infra', '---', BODY].join('\n');

		// Legacy behavior read effort as the workstream.
		const legacy = parseEntityFromContent(content, 'node-T-101', 'tasks/T-101.md');
		expect(legacy!.workstream).toBe('infra');

		// Converged behavior: schema default; effort survives in passthrough.
		const runtime = parser.parse(content, 'tasks/T-101.md');
		expect(toEntityData(runtime, 'tasks/T-101.md').workstream).toBe('engineering');
		expect(runtime.passthrough?.effort).toBe('infra');
	});
});

// =============================================================================
// 3. camelCase bridge — every getFieldValue pair (positioningV4.ts:559-580)
// =============================================================================

describe('camelCase bridge (getFieldValue field map)', () => {
	it('depends_on → dependsOn', () => {
		const e = makeEntity({ relationships: { depends_on: ['T-001', 'T-002'] } });
		expect(toEntityData(e).dependsOn).toEqual(['T-001', 'T-002']);
	});

	it('implemented_by → implementedBy', () => {
		const e = makeEntity({ id: 'F-010', type: 'feature', relationships: { implemented_by: ['M-001'] } });
		expect(toEntityData(e).implementedBy).toEqual(['M-001']);
	});

	it('previous_version → previousVersion', () => {
		const e = makeEntity({ id: 'DOC-010', type: 'document', relationships: { previous_version: 'DOC-009' } });
		expect(toEntityData(e).previousVersion).toBe('DOC-009');
	});

	it('documented_by → documentedBy (reverse container field, relationships-only)', () => {
		const e = makeEntity({ id: 'F-010', type: 'feature', relationships: { documented_by: ['DOC-001'] } });
		expect(toEntityData(e).documentedBy).toEqual(['DOC-001']);
	});

	it('decided_by → decidedBy (reverse container field, relationships-only)', () => {
		const e = makeEntity({ id: 'DOC-010', type: 'document', relationships: { decided_by: ['DEC-001'] } });
		expect(toEntityData(e).decidedBy).toEqual(['DEC-001']);
	});

	it('does NOT read documentedBy/decidedBy from passthrough or custom fields (dormant parent-rule wiring stays schema-gated)', () => {
		// A decision's `decided_by` is a PERSON custom field — must not leak
		// into the positioning bridge.
		const decision = makeEntity({
			id: 'DEC-010',
			type: 'decision',
			fields: { decided_by: 'Marc' },
			passthrough: { documented_by: ['DOC-001'] },
		});
		const projected = toEntityData(decision);
		expect(projected.decidedBy).toBeUndefined();
		expect(projected.documentedBy).toBeUndefined();
	});

	it('coerces scalar relationship values into the array shape and vice versa', () => {
		const e = makeEntity({
			relationships: { depends_on: 'T-001', supersedes: ['DEC-002'], parent: ['S-001', 'S-002'] },
		});
		const projected = toEntityData(e);
		expect(projected.dependsOn).toEqual(['T-001']);
		expect(projected.supersedes).toBe('DEC-002');
		expect(projected.parent).toBe('S-001');
	});
});

// =============================================================================
// 4. Round-trip: fromItemFrontmatter → toItemFrontmatter
// =============================================================================

describe('fromItemFrontmatter → toItemFrontmatter round-trip', () => {
	const ITEM_ENTRIES = CORPUS.filter((e) => e.fm.type !== 'feature');

	for (const entry of ITEM_ENTRIES) {
		it(`preserves every field for ${entry.name}`, () => {
			const fm = entry.fm as unknown as ItemFrontmatter;
			const runtime = fromItemFrontmatter(fm, { schema });
			const out = toItemFrontmatter(runtime) as unknown as FM;

			// Keys that are not part of the ItemFrontmatter projection type;
			// they live on the entity (relationships/passthrough), asserted below.
			const NON_ITEM_KEYS = new Set([
				'parent', 'enables', 'blocks', 'supersedes', 'previous_version',
				'decided_by', 'documented_by', 'implemented_by',
			]);
			for (const [key, value] of Object.entries(entry.fm)) {
				if (NON_ITEM_KEYS.has(key)) continue;
				expect({ [key]: out[key] }).toEqual({ [key]: value });
			}

			// Non-ItemFrontmatter relationship keys survive on the entity
			// (relationships when the schema declares a pair, else passthrough).
			for (const key of NON_ITEM_KEYS) {
				if (entry.fm[key] === undefined) continue;
				const kept = runtime.relationships[key] ?? runtime.passthrough?.[key];
				expect({ [key]: kept }).toEqual({ [key]: entry.fm[key] });
			}

			// No legacy aliases are ever emitted.
			expect(out.effort).toBeUndefined();
			expect(out.created).toBeUndefined();
			expect(out.updated).toBeUndefined();
		});
	}

	it('preserves the plugin-only fields inProgress / created_by_plugin / notion_page_id explicitly', () => {
		const fm = CORPUS[0].fm as unknown as ItemFrontmatter; // task fixture carries all three
		const runtime = fromItemFrontmatter(fm, { schema });

		// They ride passthrough on the RuntimeEntity (spec §5.1)...
		expect(runtime.passthrough).toMatchObject({
			inProgress: true,
			created_by_plugin: true,
			notion_page_id: 'abc-123',
		});

		// ...and come back out on the projection.
		const out = toItemFrontmatter(runtime);
		expect(out.inProgress).toBe(true);
		expect(out.created_by_plugin).toBe(true);
		expect(out.notion_page_id).toBe('abc-123');
	});

	it('preserves inProgress: false (falsy but present)', () => {
		const story = CORPUS.find((e) => e.name === 'story')!.fm as unknown as ItemFrontmatter;
		const out = toItemFrontmatter(fromItemFrontmatter(story, { schema }));
		expect(out.inProgress).toBe(false);
	});

	it('round-trips a feature via fromFeatureFrontmatter → toFeatureFrontmatter', () => {
		const fm = CORPUS.find((e) => e.name === 'feature')!.fm as unknown as FeatureFrontmatter;
		const runtime = fromFeatureFrontmatter(fm, { schema });
		const out = toFeatureFrontmatter(runtime) as unknown as FM;

		for (const [key, value] of Object.entries(fm)) {
			expect({ [key]: out[key] }).toEqual({ [key]: value });
		}
	});
});

// =============================================================================
// 5. priority synthesis
// =============================================================================

describe('priority synthesis', () => {
	it("synthesizes the schema default 'Medium' when the entity has no priority", () => {
		const entity = makeEntity({ fields: {} });
		expect(toItemFrontmatter(entity).priority).toBe('Medium');
		expect(toItemFrontmatter(entity).priority).toBe(DEFAULT_PRIORITY);
	});

	it('synthesizes for the feature projection too', () => {
		const entity = makeEntity({ id: 'F-900', type: 'feature', fields: {} });
		expect(toFeatureFrontmatter(entity).priority).toBe('Medium');
	});

	it('uses the schema custom field when present (milestone: priority is a schema field)', () => {
		const entity = makeEntity({ id: 'M-900', type: 'milestone', fields: { priority: 'Critical' } });
		expect(toItemFrontmatter(entity).priority).toBe('Critical');
	});

	it('falls back to passthrough for types whose schema has no priority field (task)', () => {
		// EntityParser routes a task's priority into passthrough (no schema
		// field) — the projection must still surface it, not synthesize.
		const entity = makeEntity({ passthrough: { priority: 'High' } });
		expect(toItemFrontmatter(entity).priority).toBe('High');
	});
});

// =============================================================================
// 6. fromFrontmatterObject ≡ EntityParser.parse (schema-driven separation)
// =============================================================================

describe('fromFrontmatterObject mirrors EntityParser.parse (no hardcoded relationship lists)', () => {
	for (const entry of CORPUS) {
		it(`deep-equals the parsed RuntimeEntity for ${entry.name}`, () => {
			const filePath = String(entry.fm.vault_path);
			const parsed = parser.parse(exactContentOf(entry.fm), filePath);
			const constructed = fromFrontmatterObject(entry.fm, { schema, filePath });
			expect(constructed).toEqual(parsed);
		});
	}

	it('routes keys schema-first: fields vs relationships vs passthrough', () => {
		const fm = {
			type: 'milestone',
			id: 'M-500',
			title: 'Routing probe',
			workstream: 'engineering',
			status: 'Not Started',
			priority: 'High', // schema custom field on milestone
			owner: 'marc', // schema custom field on milestone
			depends_on: ['M-001'], // schema relationship (forward)
			children: ['S-001'], // schema relationship (reverse of hierarchy)
			implements: ['F-001'], // schema relationship (forward)
			inProgress: true, // plugin-only → passthrough
			notion_page_id: 'xyz', // plugin-only → passthrough
			some_unknown_key: 'keep-me', // unknown → passthrough
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
		};

		const entity = fromFrontmatterObject(fm, { schema, filePath: 'milestones/M-500.md' });

		expect(entity.fields).toMatchObject({ priority: 'High', owner: 'marc' });
		expect(entity.relationships).toEqual({
			depends_on: ['M-001'],
			children: ['S-001'],
			implements: ['F-001'],
		});
		expect(entity.passthrough).toMatchObject({
			inProgress: true,
			notion_page_id: 'xyz',
			some_unknown_key: 'keep-me',
		});
		// Relationship keys never leak into fields or passthrough.
		expect(entity.fields.depends_on).toBeUndefined();
		expect(entity.passthrough?.depends_on).toBeUndefined();
	});

	it('applies entity-core defaults for missing status/workstream/timestamps', () => {
		const entity = fromFrontmatterObject(
			{ type: 'decision', id: 'DEC-500', title: 'Bare' },
			{ schema, filePath: 'decisions/DEC-500.md', now: '2026-07-07T00:00:00.000Z' }
		);
		expect(entity.status).toBe('Pending'); // decision defaultStatus
		expect(entity.workstream).toBe('engineering'); // schema default workstream
		expect(entity.created_at).toBe('2026-07-07T00:00:00.000Z');
		expect(entity.updated_at).toBe('2026-07-07T00:00:00.000Z');
		expect(entity.vault_path).toBe('decisions/DEC-500.md');
		expect(entity.archived).toBe(false);
	});
});
