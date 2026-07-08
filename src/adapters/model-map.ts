/**
 * model-map — pure projection layer between the canonical entity-core
 * `RuntimeEntity` and the plugin's legacy shapes (`EntityData` for the
 * positioning engine, `ItemFrontmatter`/`FeatureFrontmatter` for UI /
 * frontmatter views).
 *
 * Phase 1 of docs/ENTITY_MODEL_CONVERGENCE_SPEC.md (§4 target architecture,
 * §5 design details). Nothing consumes these functions yet — they are pure,
 * total functions over existing types with zero side effects.
 *
 * Key contracts:
 *  - `toEntityData` OWNS the snake_case → camelCase relationship translation
 *    that the positioning engine's `getFieldValue` bridge
 *    (util/positioningV4.ts:559-580) expects: depends_on→dependsOn,
 *    implemented_by→implementedBy, previous_version→previousVersion,
 *    documented_by→documentedBy, decided_by→decidedBy.
 *  - Per spec §5.3 the converged defaults are entity-core's: the literal
 *    entity type is preserved (NO unknown-type→'task' coercion) and the
 *    workstream default is the schema's ('engineering' — NO 'default' /
 *    legacy-`effort` fallback). Those legacy coercions live only in
 *    util/entityParser.ts and die with it in Phase 5.
 *  - Plugin-only fields (`inProgress`, `created_by_plugin`, `notion_page_id`)
 *    ride `RuntimeEntity.passthrough` (spec §5.1).
 *  - `fromItemFrontmatter` separates fields/relationships/passthrough purely
 *    from the schema (SchemaRegistry) — no hardcoded relationship-field lists
 *    (the drift bug this refactor kills). It mirrors EntityParser.parse
 *    (src/entity-core/parser.ts) key-for-key so `fromFrontmatterObject(fm)`
 *    equals `EntityParser.parse(serialize(fm))`.
 *
 * Relationship-key lookup note: EntityParser routes a relationship-shaped key
 * into `relationships` only when the schema declares a pair for that entity
 * type; otherwise the key lands in `passthrough` verbatim (e.g. `enables` is
 * deprecated and schema-less; `depends_on`/`blocks` on features have no
 * feature↔feature pair in the default schema). The legacy positioning parser
 * read those keys regardless of type, so for layout parity the projections
 * read `relationships[key] ?? passthrough[key]`. The reverse container fields
 * `documented_by`/`decided_by` are the one exception: they are read from
 * `relationships` ONLY, so the dormant parent-rule wiring in positioningV4
 * activates exactly when a schema+data pair actually carries the reverse
 * field (see the getFieldValue bridge comment) — and never from a passthrough
 * key or a same-named custom field (decision's `decided_by` person field).
 */

import type { RuntimeEntity } from '../entity-core/types.js';
import type { SchemaRegistry } from '../entity-core/schema-registry.js';
import type { EntityData, EntityType as PositioningEntityType } from '../../util/positioningV4.js';
import { generateNodeIdFromEntityId } from '../../util/entityParser.js';
import type {
	EntityType as PluginEntityType,
	FeatureFrontmatter,
	FeaturePhase,
	FeatureStatus,
	FeatureTier,
	ItemFrontmatter,
	ItemPriority,
} from '../../types.js';

// =============================================================================
// Shared helpers (pure)
// =============================================================================

/**
 * Default synthesized when an entity carries no `priority` custom field.
 * `ItemFrontmatter.priority` is REQUIRED (types.ts:104) while priority is an
 * optional/absent schema custom field, so the projection must synthesize one.
 * 'Medium' is the schema's own field default (default-schema.ts) and the only
 * casing `ItemPriority` admits.
 */
export const DEFAULT_PRIORITY: ItemPriority = 'Medium';

/**
 * Read a relationship-shaped key: schema-recognized values live in
 * `relationships`; keys the schema has no pair for (deprecated `enables`,
 * feature-side `depends_on`/`blocks`, milestone `parent`, …) survive in
 * `passthrough`. See file-header note.
 */
function relValue(entity: RuntimeEntity, field: string): unknown {
	const rel = entity.relationships?.[field];
	if (rel !== undefined) return rel;
	return entity.passthrough?.[field];
}

/** Read a custom field, falling back to passthrough (e.g. task `priority`,
 * feature `personas` are not schema fields and ride passthrough). */
function fieldOrPassthrough(entity: RuntimeEntity, field: string): unknown {
	const value = entity.fields?.[field];
	if (value !== undefined) return value;
	return entity.passthrough?.[field];
}

/** Coerce a relationship value to the array-of-ids shape EntityData uses. */
function asIdArray(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) return value.map((v) => String(v));
	return [String(value)];
}

/** Coerce a relationship value to the scalar-id shape (parent/supersedes/…). */
function asIdScalar(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
	return String(value);
}

/** Optional string[] (undefined when the key is absent, unlike asIdArray). */
function asOptionalIdArray(value: unknown): string[] | undefined {
	return value === undefined || value === null ? undefined : asIdArray(value);
}

// =============================================================================
// RuntimeEntity → EntityData (positioning projection)
// =============================================================================

/**
 * `EntityData` plus the reverse container fields the positioning engine's
 * getFieldValue bridge can read (`documented_by`→`documentedBy`,
 * `decided_by`→`decidedBy`). `EntityData` itself does not declare them — the
 * legacy parser never produced them — so they ride as an optional extension.
 */
export interface PositioningEntityData extends EntityData {
	documentedBy?: string[];
	decidedBy?: string[];
}

/**
 * Project a RuntimeEntity onto the positioning engine's input shape.
 *
 * Field-for-field compatible with util/entityParser.parseEntityFromFrontmatter
 * for known-type / known-workstream entities, EXCEPT the reconciled defaults
 * (spec §5.3): unknown `type` stays literal (old parser coerced → 'task');
 * a missing `workstream` already arrived from EntityParser as the schema
 * default ('engineering'), never 'default' / legacy `effort`.
 *
 * @param entity   the canonical parsed entity
 * @param filePath overrides `entity.vault_path` as EntityData.filePath
 * @param nodeId   canvas node id; defaults to the canonical derivation
 *                 `generateNodeIdFromEntityId(entity.id)` ("node-<id>")
 */
export function toEntityData(
	entity: RuntimeEntity,
	filePath?: string,
	nodeId?: string
): PositioningEntityData {
	const data: PositioningEntityData = {
		entityId: entity.id,
		nodeId: nodeId ?? generateNodeIdFromEntityId(entity.id),
		// Literal type — the old 'task' coercion is intentionally NOT reproduced.
		type: entity.type as PositioningEntityType,
		// The legacy parser lowercased the workstream lane; keep that
		// normalization so lane grouping is unchanged for mixed-case values.
		workstream: (entity.workstream ?? '').toLowerCase(),
		parent: asIdScalar(relValue(entity, 'parent')),
		dependsOn: asIdArray(relValue(entity, 'depends_on')),
		blocks: asIdArray(relValue(entity, 'blocks')),
		enables: asIdArray(relValue(entity, 'enables')),
		affects: asIdArray(relValue(entity, 'affects')),
		implementedBy: asIdArray(relValue(entity, 'implemented_by')),
		implements: asIdArray(relValue(entity, 'implements')),
		documents: asIdArray(relValue(entity, 'documents')),
		supersedes: asIdScalar(relValue(entity, 'supersedes')),
		previousVersion: asIdScalar(relValue(entity, 'previous_version')),
		filePath: filePath ?? entity.vault_path,
	};

	// Reverse container fields: relationships-only (never passthrough / custom
	// fields) so the dormant parent-rule bridge activates exactly when the
	// schema recognizes the reverse field on this type. See file-header note.
	const documentedBy = entity.relationships?.['documented_by'];
	if (documentedBy !== undefined) data.documentedBy = asIdArray(documentedBy);
	const decidedBy = entity.relationships?.['decided_by'];
	if (decidedBy !== undefined) data.decidedBy = asIdArray(decidedBy);

	return data;
}

// =============================================================================
// RuntimeEntity → ItemFrontmatter / FeatureFrontmatter (frontmatter projections)
// =============================================================================

/**
 * Project a RuntimeEntity onto the plugin's `ItemFrontmatter` view.
 *
 * - `priority` is REQUIRED on ItemFrontmatter: read the schema custom field
 *   (falling back to passthrough — task has no schema `priority`), else
 *   synthesize {@link DEFAULT_PRIORITY}.
 * - Plugin-only fields (`inProgress`, `created_by_plugin`, `notion_page_id`)
 *   come from `entity.passthrough`.
 * - Legacy aliases (`effort`, `created`, `updated`) are never emitted.
 */
export function toItemFrontmatter(entity: RuntimeEntity): ItemFrontmatter {
	const pass = entity.passthrough ?? {};

	const fm: ItemFrontmatter = {
		type: entity.type as PluginEntityType,
		title: entity.title,
		workstream: entity.workstream,
		id: entity.id,
		status: entity.status as ItemFrontmatter['status'],
		priority: (fieldOrPassthrough(entity, 'priority') as ItemPriority | undefined) ?? DEFAULT_PRIORITY,
		created_at: entity.created_at,
		updated_at: entity.updated_at,
		canvas_source: entity.canvas_source,
		vault_path: entity.vault_path,
	};

	if (pass.inProgress !== undefined) fm.inProgress = Boolean(pass.inProgress);
	const timeEstimate = fieldOrPassthrough(entity, 'time_estimate');
	if (typeof timeEstimate === 'number') fm.time_estimate = timeEstimate;

	const dependsOn = asOptionalIdArray(relValue(entity, 'depends_on'));
	if (dependsOn !== undefined) fm.depends_on = dependsOn;
	const implementsArr = asOptionalIdArray(relValue(entity, 'implements'));
	if (implementsArr !== undefined) fm.implements = implementsArr;
	const documents = asOptionalIdArray(relValue(entity, 'documents'));
	if (documents !== undefined) fm.documents = documents;
	const affects = asOptionalIdArray(relValue(entity, 'affects'));
	if (affects !== undefined) fm.affects = affects;

	if (pass.created_by_plugin !== undefined) fm.created_by_plugin = Boolean(pass.created_by_plugin);
	if (pass.notion_page_id !== undefined) fm.notion_page_id = String(pass.notion_page_id);

	return fm;
}

/**
 * Project a feature RuntimeEntity onto `FeatureFrontmatter`.
 *
 * Required FeatureFrontmatter fields absent from the entity are synthesized
 * from the schema's own field defaults (`tier` 'OSS', `phase` 'MVP',
 * `user_story` '', `priority` {@link DEFAULT_PRIORITY}).
 *
 * Note: in the default schema, feature-side `depends_on`/`blocks` and
 * `decided_by` have no relationship pair (dependency is m→m/s→s/t→t;
 * decision-impact targets documents), so on a parsed feature they live in
 * passthrough — read via relationships-with-passthrough-fallback here to keep
 * the projection lossless.
 */
export function toFeatureFrontmatter(entity: RuntimeEntity): FeatureFrontmatter {
	const pass = entity.passthrough ?? {};

	const tier = fieldOrPassthrough(entity, 'tier');
	const phase = fieldOrPassthrough(entity, 'phase');
	const userStory = fieldOrPassthrough(entity, 'user_story');

	const fm: FeatureFrontmatter = {
		id: entity.id,
		type: 'feature',
		title: entity.title,
		workstream: entity.workstream,
		user_story: userStory === undefined || userStory === null ? '' : String(userStory),
		tier: (tier === undefined || tier === null ? 'OSS' : String(tier)) as FeatureTier,
		phase: (phase === undefined || phase === null ? 'MVP' : String(phase)) as FeaturePhase,
		status: entity.status as FeatureStatus,
		priority: (fieldOrPassthrough(entity, 'priority') as ItemPriority | undefined) ?? DEFAULT_PRIORITY,
		updated_at: entity.updated_at,
		created_at: entity.created_at,
	};

	const personas = asOptionalIdArray(fieldOrPassthrough(entity, 'personas'));
	if (personas !== undefined) fm.personas = personas;
	const acceptanceCriteria = asOptionalIdArray(fieldOrPassthrough(entity, 'acceptance_criteria'));
	if (acceptanceCriteria !== undefined) fm.acceptance_criteria = acceptanceCriteria;
	const testRefs = asOptionalIdArray(fieldOrPassthrough(entity, 'test_refs'));
	if (testRefs !== undefined) fm.test_refs = testRefs;

	const implementedBy = asOptionalIdArray(relValue(entity, 'implemented_by'));
	if (implementedBy !== undefined) fm.implemented_by = implementedBy;
	const documentedBy = asOptionalIdArray(relValue(entity, 'documented_by'));
	if (documentedBy !== undefined) fm.documented_by = documentedBy;
	const decidedBy = asOptionalIdArray(relValue(entity, 'decided_by'));
	if (decidedBy !== undefined) fm.decided_by = decidedBy;
	const dependsOn = asOptionalIdArray(relValue(entity, 'depends_on'));
	if (dependsOn !== undefined) fm.depends_on = dependsOn;
	const blocks = asOptionalIdArray(relValue(entity, 'blocks'));
	if (blocks !== undefined) fm.blocks = blocks;

	if (pass.created_by_plugin !== undefined) fm.created_by_plugin = Boolean(pass.created_by_plugin);

	return fm;
}

/**
 * Flatten a RuntimeEntity back to the loose flat-record view that
 * `util/frontmatter.parseAnyFrontmatter` produced: system fields + custom
 * fields + relationships + passthrough merged into one Record. Lossless by
 * construction — EntityParser partitions every frontmatter key into exactly
 * one of those buckets — so dynamic key reads (`fm[fieldName]`) keep working.
 * Unlike the raw parser, system defaults (status/workstream/timestamps) are
 * always present, which callers treat identically to reading them off a file
 * that had them.
 */
export function toFlatFrontmatter(entity: RuntimeEntity): Record<string, unknown> {
	return {
		id: entity.id,
		type: entity.type,
		title: entity.title,
		status: entity.status,
		workstream: entity.workstream,
		created_at: entity.created_at,
		updated_at: entity.updated_at,
		...(entity.archived ? { archived: entity.archived } : {}),
		vault_path: entity.vault_path,
		...(entity.canvas_source ? { canvas_source: entity.canvas_source } : {}),
		...entity.fields,
		...entity.relationships,
		...(entity.passthrough ?? {}),
	};
}

// =============================================================================
// ItemFrontmatter → RuntimeEntity (inverse construction)
// =============================================================================

export interface FromFrontmatterOptions {
	/** Drives field/relationship/passthrough separation — nothing is hardcoded. */
	schema: SchemaRegistry;
	/** Used for `vault_path` when the frontmatter carries none. */
	filePath?: string;
	/**
	 * Timestamp used when `created_at`/`updated_at` are absent. Injectable so
	 * the construction is deterministic in tests; defaults to now (matching
	 * EntityParser.parse).
	 */
	now?: string;
}

/**
 * Build a RuntimeEntity from an already-parsed frontmatter object.
 *
 * Mirrors EntityParser.parse (src/entity-core/parser.ts) key-for-key —
 * including its quirks (e.g. `vault_path`/`canvas_source`/`archived` are not
 * in SchemaRegistry.getSystemFields(), so they are ALSO copied into
 * passthrough) — so that for any frontmatter object,
 * `fromFrontmatterObject(fm)` deep-equals `EntityParser.parse(serialize(fm))`.
 *
 * Defaults are entity-core's (spec §5.3): missing status → the type's schema
 * default; missing workstream → the schema default workstream; the literal
 * type is preserved.
 */
export function fromFrontmatterObject(
	frontmatter: Record<string, unknown>,
	opts: FromFrontmatterOptions
): RuntimeEntity {
	const { schema } = opts;
	const now = opts.now ?? new Date().toISOString();
	const type = String(frontmatter.type ?? '');

	const entity: RuntimeEntity = {
		id: String(frontmatter.id ?? ''),
		type,
		title: (frontmatter.title as string) || 'Untitled',
		status: (frontmatter.status as string) || schema.getDefaultStatus(type),
		workstream: (frontmatter.workstream as string) || schema.getDefaultWorkstream(),
		created_at: (frontmatter.created_at as string) || now,
		updated_at: (frontmatter.updated_at as string) || now,
		archived: Boolean(frontmatter.archived),
		vault_path: (frontmatter.vault_path as string) || (opts.filePath ?? ''),
		canvas_source: (frontmatter.canvas_source as string) || '',
		fields: {},
		relationships: {},
	};

	// Schema custom fields for this type.
	const typeFields = schema.getFields(type);
	for (const field of typeFields) {
		const value = frontmatter[field.name];
		if (value !== undefined && value !== null) {
			entity.fields[field.name] = value;
		}
	}

	// Schema relationship fields for this type (forward when this type is the
	// FROM side of a pair, reverse when it is the TO side).
	const relationshipFieldNames = new Set<string>();
	for (const rel of schema.getRelationshipsForType(type)) {
		for (const pair of rel.pairs) {
			if (pair.from === type || pair.from === '*') {
				relationshipFieldNames.add(pair.forward);
				const value = frontmatter[pair.forward];
				if (value !== undefined && value !== null) {
					entity.relationships[pair.forward] = value as string | string[];
				}
			}
			if (pair.to === type || pair.to === '*') {
				relationshipFieldNames.add(pair.reverse);
				const value = frontmatter[pair.reverse];
				if (value !== undefined && value !== null) {
					entity.relationships[pair.reverse] = value as string | string[];
				}
			}
		}
	}

	// Everything else (plugin-only fields, unknown keys) → passthrough.
	const systemFields = new Set(schema.getSystemFields());
	const customFieldNames = new Set(typeFields.map((f) => f.name));
	const passthrough: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(frontmatter)) {
		if (
			!systemFields.has(key) &&
			!customFieldNames.has(key) &&
			!relationshipFieldNames.has(key) &&
			value !== undefined &&
			value !== null
		) {
			passthrough[key] = value;
		}
	}
	if (Object.keys(passthrough).length > 0) {
		entity.passthrough = passthrough;
	}

	return entity;
}

/** Inverse of {@link toItemFrontmatter}: ItemFrontmatter → RuntimeEntity. */
export function fromItemFrontmatter(
	fm: ItemFrontmatter,
	opts: FromFrontmatterOptions
): RuntimeEntity {
	return fromFrontmatterObject(fm as unknown as Record<string, unknown>, opts);
}

/** Inverse of {@link toFeatureFrontmatter}: FeatureFrontmatter → RuntimeEntity. */
export function fromFeatureFrontmatter(
	fm: FeatureFrontmatter,
	opts: FromFrontmatterOptions
): RuntimeEntity {
	return fromFrontmatterObject(fm as unknown as Record<string, unknown>, opts);
}
