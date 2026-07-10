/**
 * Entity Navigator - Index and navigation utilities for project entities
 *
 * Supports entity types: milestone, story, task, decision, document, feature
 * ID patterns: M-xxx, S-xxx, T-xxx, DEC-xxx, DOC-xxx, F-xxx
 *
 * Phase 3 of docs/ENTITY_MODEL_CONVERGENCE_SPEC.md (§5 "Two indexes"): the
 * public `EntityIndex` API (class name, constructor shape, all method
 * signatures) is unchanged, but the internals are now backed by entity-core's
 * `ProjectIndex` instead of a hand-rolled `Map<string, EntityIndexEntry>`:
 *
 *  - The vault scan reads file CONTENT (`vault.cachedRead`) and parses it with
 *    entity-core's `EntityParser` (replacing the direct
 *    `metadataCache.getFileCache().frontmatter` read), then feeds
 *    `EntityMetadata` into a `ProjectIndex`.
 *  - Navigation methods are queries over the ProjectIndex's primary/secondary
 *    indexes (`by_type`, `by_parent`) and its forward/reverse relationship
 *    graph.
 *  - `EntityIndexEntry` survives only as a projection at the API boundary,
 *    materialized on demand from `EntityMetadata` + graph edges + a slim
 *    id → { TFile, tier, phase } side map (TFile and feature tier/phase are
 *    not part of `EntityMetadata`).
 *  - Relationship keys the schema has no pair for (feature-side
 *    `depends_on`/`blocks`/`decided_by`, deprecated `enables`, milestone
 *    `parent`, …) land in `RuntimeEntity.passthrough`, so graph edges are
 *    built from `relationships[key] ?? passthrough[key]` — mirroring
 *    src/adapters/model-map.ts. Custom FIELDS named like relationship keys
 *    (e.g. decision's `decided_by` person field) live in `entity.fields` and
 *    are deliberately NOT turned into edges.
 */

import type { App, TFile } from "obsidian";
import type { EntityType, EntityNavigatorSettings } from "../types";
import { ProjectIndex } from "../src/entity-core/project-index.js";
import { EntityParser } from "../src/entity-core/parser.js";
import { SchemaRegistry } from "../src/entity-core/schema-registry.js";
import { DEFAULT_SCHEMA } from "../src/entity-core/default-schema.js";
import { buildReverseRelationMap } from "../src/entity-core/schema-derivation.js";
import type { EntityMetadata, RuntimeEntity, Schema } from "../src/entity-core/types.js";

// ID patterns for entity types
export const ID_PATTERNS: Record<string, RegExp> = {
	milestone: /^M-\d{3,}$/,
	story: /^S-\d{3,}$/,
	task: /^T-\d{3,}$/,
	decision: /^DEC-\d{3,}$/,
	document: /^DOC-\d{3,}$/,
	feature: /^F-\d{3,}$/,
};

// Entity index entry — the navigator's public boundary projection (survives
// Phase 5; materialized on demand from ProjectIndex state, see toEntry()).
export interface EntityIndexEntry {
	id: string;
	type: EntityType;
	file: TFile;
	title: string;
	parent?: string;
	depends_on: string[];
	implements: string[];   // Features this entity implements (for milestones/stories)
	documents: string[];    // Features this document documents (for documents)
	affects: string[];      // Features this decision affects (for decisions)
	enables: string[];
	implemented_by: string[];
	// Feature-specific fields
	documented_by: string[];
	decided_by: string[];
	blocks: string[];
	tier?: string;
	phase?: string;
}

/** Get entity type from ID string */
export function getEntityTypeFromId(id: string): EntityType | null {
	if (ID_PATTERNS.milestone.test(id)) return 'milestone';
	if (ID_PATTERNS.story.test(id)) return 'story';
	if (ID_PATTERNS.task.test(id)) return 'task';
	if (ID_PATTERNS.decision.test(id)) return 'decision';
	if (ID_PATTERNS.document.test(id)) return 'document';
	if (ID_PATTERNS.feature.test(id)) return 'feature';
	return null;
}

/** Check if a string is a valid entity ID */
export function isEntityId(id: string): boolean {
	return getEntityTypeFromId(id) !== null;
}

// =============================================================================
// Internal helpers (pure) — mirror src/adapters/model-map.ts's lookup contract
// =============================================================================

/**
 * The relationship-shaped keys `EntityIndexEntry` captures as arrays. These are
 * the exact edge types fed into the ProjectIndex relationship graph, DERIVED
 * from the schema.
 *
 * Criterion: forward+reverse fields of every relationship whose cardinality is
 * many↔many. The exclusions are semantic, not accidental:
 *  - hierarchy (parent 'one' / children 'many') is NOT graph-edge state here —
 *    parent rides `EntityMetadata.parent_id` and children queries go through
 *    the ProjectIndex `by_parent` secondary index (see getParent/getChildren),
 *    so feeding it into the edge graph would double-index it;
 *  - supersession/versioning ('one'↔'one' scalar links) have no navigator
 *    query and no `EntityIndexEntry` projection — the pre-derivation list
 *    omitted them too.
 * With DEFAULT_SCHEMA this yields exactly the previously hardcoded list
 * (minus deprecated `enables`, re-added below as a legacy edge key).
 *
 * TODO(consolidate): move this derivation to src/entity-core/schema-derivation.ts
 */
function deriveManyToManyRelationshipFields(schema: Schema): string[] {
	const fields: string[] = [];
	for (const rel of schema.relationships) {
		if (rel.cardinality.forward !== "many" || rel.cardinality.reverse !== "many") continue;
		for (const p of rel.pairs) {
			if (!fields.includes(p.forward)) fields.push(p.forward);
			if (!fields.includes(p.reverse)) fields.push(p.reverse);
		}
	}
	return fields;
}

/**
 * Deprecated relationship keys that are NOT in the schema but still exist in
 * legacy vault files and are load-bearing for the navigator: `enables` edges
 * ride RuntimeEntity.passthrough and back getEnabledEntities() /
 * getRelatedDecisions() and the EntityIndexEntry.enables projection. Kept as
 * an explicit legacy list so the schema derivation stays clean.
 */
const LEGACY_ENTRY_RELATIONSHIP_FIELDS = ["enables"] as const;

export function deriveEntryRelationshipFields(schema: Schema): string[] {
	return [...deriveManyToManyRelationshipFields(schema), ...LEGACY_ENTRY_RELATIONSHIP_FIELDS];
}

/**
 * Read a relationship-shaped key: schema-recognized values live in
 * `relationships`; keys the schema has no pair for (feature-side
 * `depends_on`/`blocks`/`decided_by`, deprecated `enables`, milestone
 * `parent`) survive in `passthrough`. Custom fields (decision's `decided_by`
 * person field) live in `fields` and are intentionally NOT read here.
 */
function relationshipValue(entity: RuntimeEntity, field: string): unknown {
	const rel = entity.relationships?.[field];
	if (rel !== undefined && rel !== null) return rel;
	return entity.passthrough?.[field];
}

/** Read a custom field, falling back to passthrough (feature `tier`/`phase`
 * are schema fields; on other types the same key rides passthrough). */
function fieldOrPassthrough(entity: RuntimeEntity, field: string): unknown {
	const value = entity.fields?.[field];
	if (value !== undefined && value !== null) return value;
	return entity.passthrough?.[field];
}

/** Coerce a relationship value to the array-of-ids shape (legacy
 * normalizeArray semantics: scalar string → single-element array). */
function asIdArray(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) return value.map((v) => String(v));
	return [String(value)];
}

/** Coerce a relationship value to a scalar id (parent). */
function asIdScalar(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
	return String(value);
}

/** Optional string coercion (tier/phase/priority may parse as YAML numbers). */
function asOptionalString(value: unknown): string | undefined {
	return value === undefined || value === null ? undefined : String(value);
}

/** Slim side-record for data the ProjectIndex does not carry: the TFile handle
 * plus the feature-specific tier/phase custom fields. */
interface EntityRecord {
	file: TFile;
	tier?: string;
	phase?: string;
}

/** Entity Index - maintains a map of entity IDs to files */
export class EntityIndex {
	/** Single queryable index (spec §4): primary/secondary indexes + relationship graph. */
	private projectIndex: ProjectIndex;
	/** id → TFile (+ tier/phase) projection support; not queryable navigation state. */
	private records: Map<string, EntityRecord> = new Map();
	private app: App;
	private settings: EntityNavigatorSettings;
	private initialized: boolean = false;
	private parser: EntityParser;
	/** field → inverse field, derived from the active schema (single source of truth). */
	private inverseRelationMap: Record<string, string>;
	/** The edge-type keys fed into the relationship graph, derived from the same schema. */
	private entryRelationshipFields: string[];

	constructor(app: App, settings: EntityNavigatorSettings, schema?: SchemaRegistry) {
		this.app = app;
		this.settings = settings;
		const registry = schema ?? new SchemaRegistry(DEFAULT_SCHEMA);
		this.parser = new EntityParser(registry);
		this.inverseRelationMap = buildReverseRelationMap(registry.getSchema());
		this.entryRelationshipFields = deriveEntryRelationshipFields(registry.getSchema());
		this.projectIndex = new ProjectIndex(this.inverseRelationMap);
	}

	/**
	 * The internal entity-core ProjectIndex (Phase 5: replaces the deleted
	 * EntityIndexAdapter). ProjectIndex implements the entity-core EntityIndex
	 * interface natively, so the facade's index-dependent engines (IDAllocator,
	 * RelationshipGraph) can be wired to it directly:
	 * `entityCore.initializeWithIndex(entityIndex.getCoreIndex())`.
	 * Note: relationship edges are keyed by FIELD name (`depends_on`, …), so
	 * `buildAdjacency` takes field names — the edge-type keys this index stores.
	 */
	getCoreIndex(): ProjectIndex {
		return this.projectIndex;
	}

	/** Build the entity index from vault files */
	async buildIndex(): Promise<void> {
		console.log("[Entity Navigator] Building entity index...");
		this.projectIndex.clear();
		this.records.clear();
		const files = this.app.vault.getMarkdownFiles();
		let indexed = 0;
		for (const file of files) {
			const entity = await this.readEntity(file);
			if (entity) {
				this.indexEntity(entity, file);
				indexed++;
			}
		}
		this.initialized = true;
		console.log(`[Entity Navigator] Indexed ${indexed} entities`);
	}

	/**
	 * Read + parse a file into a RuntimeEntity, or null when it is not an
	 * entity. This replaces the legacy `metadataCache.getFileCache()` read: the
	 * scan now parses file CONTENT through entity-core's EntityParser
	 * (spec Phase 3: migrate the direct metadataCache read).
	 */
	private async readEntity(file: TFile): Promise<RuntimeEntity | null> {
		let content: string;
		try {
			content = await this.app.vault.cachedRead(file);
		} catch {
			return null;
		}
		const entity = this.parseEntityContent(content, file);
		if (!entity || !isEntityId(entity.id)) return null;
		return entity;
	}

	/** Parse content, tolerating legacy files whose frontmatter omits id/type. */
	private parseEntityContent(content: string, file: TFile): RuntimeEntity | null {
		try {
			return this.parser.parse(content, file.path);
		} catch {
			return this.parseWithDerivedIdentity(content, file);
		}
	}

	/**
	 * Legacy tolerance preserved from the metadataCache-based indexer: a file
	 * may omit `id` (derived from the basename, e.g. "T-042 Something.md") and/or
	 * `type` (derived from the id prefix). EntityParser requires both, so we
	 * inject the derived keys into the frontmatter block and re-parse — keeping
	 * EntityParser as the single parse path.
	 */
	private parseWithDerivedIdentity(content: string, file: TFile): RuntimeEntity | null {
		const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
		if (!match) return null;
		const yaml = match[1];
		const hasId = /^id\s*:\s*\S/m.test(yaml);
		const hasType = /^type\s*:\s*\S/m.test(yaml);
		// Both present → the parse failed for another reason (e.g. invalid YAML);
		// the legacy indexer skipped such files too (no metadataCache frontmatter).
		if (hasId && hasType) return null;

		let id: string | undefined;
		if (hasId) {
			const idMatch = yaml.match(/^id\s*:\s*(.+)$/m);
			id = idMatch?.[1].trim().replace(/^['"]|['"]$/g, "");
		} else {
			// Match F-xxx for features as well (legacy basename-derived ids)
			const nameMatch = file.basename.match(/^([A-Z]+-\d{3,}|DEC-\d{3,}|DOC-\d{3,}|F-\d{3,})/);
			if (nameMatch) id = nameMatch[1];
		}
		if (!id || !isEntityId(id)) return null;

		const derivedType = hasType ? null : getEntityTypeFromId(id);
		if (!hasType && !derivedType) return null;

		const inject: string[] = [];
		if (!hasId) inject.push(`id: ${id}`);
		if (!hasType) inject.push(`type: ${derivedType}`);
		const patched = content.replace(/^---\n/, `---\n${inject.join("\n")}\n`);
		try {
			return this.parser.parse(patched, file.path);
		} catch {
			return null;
		}
	}

	/** Project a parsed entity into the ProjectIndex's EntityMetadata shape. */
	private toMetadata(entity: RuntimeEntity, file: TFile): EntityMetadata {
		return {
			id: entity.id,
			type: entity.type,
			title: entity.title,
			workstream: entity.workstream,
			status: entity.status,
			archived: entity.archived,
			in_progress: Boolean(
				entity.passthrough?.inProgress ?? entity.passthrough?.in_progress
			),
			parent_id: asIdScalar(relationshipValue(entity, "parent")),
			children_count: 0,
			priority: asOptionalString(fieldOrPassthrough(entity, "priority")),
			canvas_source: entity.canvas_source,
			// Key the index by the file's ACTUAL location, never a stale
			// frontmatter vault_path.
			vault_path: file.path,
			file_mtime: file.stat?.mtime ?? 0,
			created_at: entity.created_at,
			updated_at: entity.updated_at,
		};
	}

	/**
	 * Insert/replace an entity in the ProjectIndex: metadata + secondary
	 * indexes + this entity's own forward relationship edges. Incoming edges
	 * owned by OTHER entities are never touched (removeForwardRelationships),
	 * so re-indexing a changed file preserves reverse queries like
	 * getDependents/getImplementors.
	 */
	private indexEntity(entity: RuntimeEntity, file: TFile): void {
		const id = entity.id;
		this.projectIndex.set(this.toMetadata(entity, file));
		this.projectIndex.removeForwardRelationships(id);
		for (const field of this.entryRelationshipFields) {
			for (const target of asIdArray(relationshipValue(entity, field))) {
				if (target.length > 0) this.projectIndex.addRelationship(id, field, target);
			}
		}
		this.records.set(id, {
			file,
			tier: asOptionalString(fieldOrPassthrough(entity, "tier")),
			phase: asOptionalString(fieldOrPassthrough(entity, "phase")),
		});
	}

	/**
	 * The id of the entity CURRENTLY indexed at this path. When duplicate ids
	 * exist, only the winning (last-indexed) file "occupies" the id — matching
	 * the legacy Map's path-scan semantics.
	 */
	private getIdAtPath(path: string): string | undefined {
		const id = this.projectIndex.getIdByPath(path);
		if (id === undefined) return undefined;
		return this.projectIndex.get(id)?.vault_path === path ? id : undefined;
	}

	private deleteEntity(id: string): void {
		this.projectIndex.delete(id);
		this.records.delete(id);
	}

	/** Update index when a file changes */
	async updateFile(file: TFile): Promise<void> {
		const previousId = this.getIdAtPath(file.path);
		const entity = await this.readEntity(file);
		if (!entity) {
			// No longer an entity — drop the stale entry (legacy delete-by-path).
			if (previousId) this.deleteEntity(previousId);
			return;
		}
		// Id changed in place: remove the old identity BEFORE indexing the new
		// one so the path mapping isn't clobbered.
		if (previousId && previousId !== entity.id) this.deleteEntity(previousId);
		this.indexEntity(entity, file);
	}

	/** Remove file from index */
	removeFile(file: TFile): void {
		const id = this.getIdAtPath(file.path);
		if (id) {
			this.deleteEntity(id);
		} else {
			// Stale duplicate mapping (this path lost an id collision): clean the
			// path mapping without deleting the winning entity.
			this.projectIndex.removePathMapping(file.path);
		}
	}

	// =========================================================================
	// EntityIndexEntry projection (spec: retired internally, kept at the API)
	// =========================================================================

	/** Materialize the legacy EntityIndexEntry shape from ProjectIndex state. */
	private toEntry(meta: EntityMetadata): EntityIndexEntry | undefined {
		const record = this.records.get(meta.id);
		if (!record) return undefined;
		return {
			id: meta.id,
			type: meta.type as EntityType,
			file: record.file,
			title: meta.title,
			parent: meta.parent_id,
			depends_on: this.projectIndex.getRelated(meta.id, "depends_on"),
			implements: this.projectIndex.getRelated(meta.id, "implements"),
			documents: this.projectIndex.getRelated(meta.id, "documents"),
			affects: this.projectIndex.getRelated(meta.id, "affects"),
			enables: this.projectIndex.getRelated(meta.id, "enables"),
			implemented_by: this.projectIndex.getRelated(meta.id, "implemented_by"),
			// Feature-specific fields
			documented_by: this.projectIndex.getRelated(meta.id, "documented_by"),
			decided_by: this.projectIndex.getRelated(meta.id, "decided_by"),
			blocks: this.projectIndex.getRelated(meta.id, "blocks"),
			tier: record.tier,
			phase: record.phase,
		};
	}

	/** The schema-derived inverse of a relationship field (identity for
	 * schema-less fields like `enables` — same rule ProjectIndex applies). */
	private inverseOf(field: string): string {
		return this.inverseRelationMap[field] || field;
	}

	/** Forward edge targets for `id` on `field` (what the file itself declares). */
	private forwardTargets(id: string, field: string): string[] {
		return this.projectIndex.getRelated(id, field);
	}

	/** Sources whose FORWARD `field` points at `id` (reverse-graph query; the
	 * reverse bucket is keyed by the schema inverse of the forward field). */
	private reverseSources(id: string, field: string): string[] {
		return this.projectIndex.getRelatedReverse(id, this.inverseOf(field));
	}

	/** Materialize a list of ids into entries, dropping unindexed ids. */
	private materialize(ids: string[]): EntityIndexEntry[] {
		const result: EntityIndexEntry[] = [];
		for (const id of ids) {
			const entry = this.get(id);
			if (entry) result.push(entry);
		}
		return result;
	}

	// =========================================================================
	// Public API (signatures unchanged)
	// =========================================================================

	/** Get entity by ID */
	get(id: string): EntityIndexEntry | undefined {
		const meta = this.projectIndex.get(id);
		return meta ? this.toEntry(meta) : undefined;
	}

	/** Get file by entity ID */
	getFile(id: string): TFile | undefined { return this.records.get(id)?.file; }

	/** Check if index is ready */
	isReady(): boolean { return this.initialized; }

	/** Get all entities of a specific type */
	getByType(type: EntityType): EntityIndexEntry[] {
		return this.projectIndex
			.getByType(type)
			.map((meta) => this.toEntry(meta))
			.filter((e): e is EntityIndexEntry => e !== undefined);
	}

	/** Get all entities (needed by entity-core adapter) */
	getAll(): EntityIndexEntry[] {
		return this.projectIndex
			.getAll()
			.map((meta) => this.toEntry(meta))
			.filter((e): e is EntityIndexEntry => e !== undefined);
	}

	// =========================================================================
	// Navigation Methods
	// =========================================================================

	/** Get parent entity (Story->Milestone, Task->Story) */
	getParent(id: string): EntityIndexEntry | undefined {
		const meta = this.projectIndex.get(id);
		if (!meta?.parent_id) return undefined;
		return this.get(meta.parent_id);
	}

	/** Get children entities (Milestone->Stories, Story->Tasks) */
	getChildren(id: string): EntityIndexEntry[] {
		return this.projectIndex
			.getByParent(id)
			.map((meta) => this.toEntry(meta))
			.filter((e): e is EntityIndexEntry => e !== undefined);
	}

	/** Get dependencies (entities this one depends on) */
	getDependencies(id: string): EntityIndexEntry[] {
		if (!this.projectIndex.has(id)) return [];
		return this.materialize(this.forwardTargets(id, "depends_on"));
	}

	/** Get dependents (entities that depend on this one) */
	getDependents(id: string): EntityIndexEntry[] {
		return this.materialize(this.reverseSources(id, "depends_on"));
	}

	/** Get documents this entity implements */
	getImplementedDocuments(id: string): EntityIndexEntry[] {
		if (!this.projectIndex.has(id)) return [];
		return this.materialize(this.forwardTargets(id, "implements"));
	}

	/** Get entities that implement this document */
	getImplementors(docId: string): EntityIndexEntry[] {
		if (!this.projectIndex.has(docId)) return [];
		// From both directions, deduped: entities declaring `implements: [docId]`
		// first, then the document's own `implemented_by` list.
		const candidates = [
			...this.reverseSources(docId, "implements"),
			...this.forwardTargets(docId, "implemented_by"),
		];
		const seen = new Set<string>();
		const result: EntityIndexEntry[] = [];
		for (const id of candidates) {
			if (seen.has(id)) continue;
			seen.add(id);
			const entry = this.get(id);
			if (entry) result.push(entry);
		}
		return result;
	}

	/** Get decisions related to an entity */
	getRelatedDecisions(id: string): EntityIndexEntry[] {
		if (!this.projectIndex.has(id)) return [];
		const decisions = new Set<string>();
		for (const depId of this.forwardTargets(id, "depends_on")) {
			if (getEntityTypeFromId(depId) === 'decision') decisions.add(depId);
		}
		for (const srcId of this.reverseSources(id, "enables")) {
			if (this.projectIndex.get(srcId)?.type === 'decision') decisions.add(srcId);
		}
		return this.materialize(Array.from(decisions));
	}

	/** Get entities enabled by a decision */
	getEnabledEntities(decisionId: string): EntityIndexEntry[] {
		if (!this.projectIndex.has(decisionId)) return [];
		return this.materialize(this.forwardTargets(decisionId, "enables"));
	}

	/** Get entity from file */
	getFromFile(file: TFile): EntityIndexEntry | undefined {
		const id = this.getIdAtPath(file.path);
		return id ? this.get(id) : undefined;
	}

	// =========================================================================
	// Feature-specific Navigation Methods
	// =========================================================================

	/** Get features that a milestone/story implements */
	getFeaturesImplementedBy(id: string): EntityIndexEntry[] {
		return this.materialize(
			this.reverseSources(id, "implemented_by").filter(
				(fid) => this.projectIndex.get(fid)?.type === 'feature'
			)
		);
	}

	/** Get milestones/stories that implement a feature */
	getFeatureImplementors(featureId: string): EntityIndexEntry[] {
		const meta = this.projectIndex.get(featureId);
		if (!meta || meta.type !== 'feature') return [];
		return this.materialize(this.forwardTargets(featureId, "implemented_by"));
	}

	/** Get documents that document a feature */
	getFeatureDocuments(featureId: string): EntityIndexEntry[] {
		const meta = this.projectIndex.get(featureId);
		if (!meta || meta.type !== 'feature') return [];
		return this.materialize(this.forwardTargets(featureId, "documented_by"));
	}

	/** Get decisions that affect a feature */
	getFeatureDecisions(featureId: string): EntityIndexEntry[] {
		const meta = this.projectIndex.get(featureId);
		if (!meta || meta.type !== 'feature') return [];
		return this.materialize(this.forwardTargets(featureId, "decided_by"));
	}

	/** Get features that depend on this feature */
	getFeatureDependents(featureId: string): EntityIndexEntry[] {
		return this.materialize(
			this.reverseSources(featureId, "depends_on").filter(
				(fid) => this.projectIndex.get(fid)?.type === 'feature'
			)
		);
	}

	/** Get features that this feature blocks */
	getBlockedFeatures(featureId: string): EntityIndexEntry[] {
		const meta = this.projectIndex.get(featureId);
		if (!meta || meta.type !== 'feature') return [];
		return this.materialize(this.forwardTargets(featureId, "blocks"));
	}

	/** Get features by tier (OSS or Premium) */
	getFeaturesByTier(tier: string): EntityIndexEntry[] {
		return this.getByType('feature').filter((e) => e.tier === tier);
	}

	/** Get features by phase (MVP, 0, 1, 2, 3, 4, 5) */
	getFeaturesByPhase(phase: string): EntityIndexEntry[] {
		return this.getByType('feature').filter((e) => e.phase === phase);
	}
}
