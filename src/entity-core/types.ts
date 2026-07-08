/**
 * @ostanlabs/entity-core — core type definitions.
 *
 * These are the shared types for the schema-driven entity engine. They are REAL
 * (data/contract types), not stubs. The engine *classes* that operate on them
 * (SchemaRegistry, EntitySerializer, …) are stubbed elsewhere and throw
 * `NOT_IMPLEMENTED` until the implementation agent drives the contract suite green.
 *
 * Source of truth: UNIFICATION_AND_CONFIGURABLE_SCHEMA_SPEC.md (corrected v1.1) §2, §4-13.
 */

// =============================================================================
// Branded-ish identifier / scalar types
// =============================================================================

/**
 * Entity identifier, e.g. "M-001", "DEC-042". Kept as a plain string alias so
 * test fixtures can use string literals directly. The schema (not this type)
 * defines the valid prefixes.
 */
export type EntityId = string;

/** Schema-driven entity type discriminator, e.g. "milestone". NOT a fixed union. */
export type EntityType = string;

/** ISO-8601 date or datetime string. */
export type ISODateTime = string;

/** Vault-relative path, e.g. "entities/milestones/M-001_launch.md". */
export type VaultPath = string;

/** Canvas file path, e.g. "projects/main.canvas". */
export type CanvasPath = string;

// =============================================================================
// Schema definition types (§2.2)
// =============================================================================

export type FieldKind =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'string[]'
  | 'markdown'
  | 'url'
  | 'multi-enum'
  | 'computed';

export interface FieldDefinition {
  name: string;
  kind: FieldKind;
  /** Allowed values for `enum` / `multi-enum`. */
  values?: string[];
  required?: boolean;
  default?: unknown;
}

export interface CanvasTypeConfig {
  width: number;
  height: number;
  /** Obsidian color id ("1".."6") or hex ("#FF5733"). */
  color: string;
  icon?: string;
}

export interface EntityTypeDefinition {
  type: EntityType;
  label: string;
  idPrefix: string;
  folder: string;
  statuses: string[];
  defaultStatus: string;
  fields: FieldDefinition[];
  canvas: CanvasTypeConfig;
}

export type Cardinality = 'one' | 'many';

export interface RelationshipPair {
  /** Source entity type, or "*" for any. */
  from: EntityType | '*';
  /** Target entity type, or "*" for any. */
  to: EntityType | '*';
  /** Field name written on the FROM entity. */
  forward: string;
  /** Field name written on the TO entity (NEVER null — every rel is bidirectional). */
  reverse: string;
}

export interface RelationshipCanvasConfig {
  color: string;
  style: string; // "solid" | "dashed" | "dotted"
}

export interface RelationshipGraphConfig {
  transitiveReduction: boolean;
  cyclePrevention: boolean;
}

/**
 * Positioning/containment metadata for a relationship — the single source of
 * truth for how the plugin's positioning engine (positioningV4) and the MCP
 * validator treat this relationship. Consumed via buildRelationshipRules() and
 * buildValidationAllowList() in schema-derivation.ts.
 */
export interface RelationshipPositioning {
  /** 'containment' builds the tree (WHERE a node sits); 'sequencing' orders siblings. */
  role: 'containment' | 'sequencing';
  // ---- containment ----
  /** Which end of each pair is the CONTAINER (parent); the other end is the child. */
  containerEnd?: 'from' | 'to';
  /** Containment conflict priority (lower wins) for the child-placement rule. */
  priority?: number;
  /** Also emit the parent-side rule (container.field → child, direction 'parent'). */
  emitParentRule?: boolean;
  // ---- sequencing ----
  /** Direction the FORWARD field implies ('after' for depends_on/previous_version, 'before' for supersedes). */
  forwardDirection?: 'before' | 'after';
  /** Also emit the reverse-field rule (opposite direction) — true for depends_on/blocks. */
  emitReverseRule?: boolean;
  /** Apply cross-workstream position constraints (suppressed for excluded types). */
  crossWsPositioning?: boolean;
  /**
   * Entity types for which cross-workstream positioning is suppressed even when
   * `crossWsPositioning` is true. Defaults to `['task']` when omitted (back-compat).
   */
  crossWsExcludedTypes?: string[];
}

export interface RelationshipDefinition {
  name: string;
  label: string;
  pairs: RelationshipPair[];
  cardinality: { forward: Cardinality; reverse: Cardinality };
  canvas: RelationshipCanvasConfig;
  graph: RelationshipGraphConfig;
  /** Positioning/validation semantics — single source of truth (optional for back-compat). */
  positioning?: RelationshipPositioning;
}

export interface SchemaSettings {
  idPadding: number;
  archiveLayout: 'by-type' | 'quarterly';
  filenamePattern: string;
  /**
   * Casing/sanitization mode for the `{title}` slug in `filenamePattern`.
   *   - 'snake'    : lowercase, non-alphanumerics → `_` (legacy default).
   *   - 'preserve' : keep case + hyphens, whitespace/invalid → `_`.
   * Defaults to 'snake' when omitted (SchemaRegistry.getFilenameCase).
   */
  filenameCase?: 'snake' | 'preserve';
  /**
   * Type priority order (highest priority first) used by the positioning engine's
   * overlap resolver: when two nodes overlap, the lower-priority one is moved.
   * When omitted the engine falls back to its built-in default order.
   */
  overlapPriorityOrder?: string[];
}

export interface WorkstreamsConfig {
  values: string[];
  default: string;
  /** Map of alias → canonical workstream. */
  normalization: Record<string, string>;
  canvas: Record<string, { color: string }>;
}

export interface Schema {
  schemaVersion: number;
  settings: SchemaSettings;
  entityTypes: EntityTypeDefinition[];
  relationships: RelationshipDefinition[];
  workstreams: WorkstreamsConfig;
}

// =============================================================================
// Runtime entity model (§4.2)
// =============================================================================

export interface BaseEntity {
  id: EntityId;
  type: EntityType;
  title: string;
  status: string;
  workstream: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  archived: boolean;
  vault_path: VaultPath;
  canvas_source: CanvasPath;
}

export interface Entity<T extends Record<string, unknown> = Record<string, unknown>>
  extends BaseEntity {
  /** Schema-defined custom fields. */
  fields: T;
  /** Dynamic relationship fields (parent, children, depends_on, …). */
  relationships: Record<string, EntityId | EntityId[]>;
  /**
   * Unknown frontmatter keys preserved verbatim across a parse→serialize cycle
   * (WI-1 passthrough: notion_page_id, inProgress, …). The data-loss guard (suite B)
   * asserts these survive a round-trip.
   */
  passthrough?: Record<string, unknown>;
}

/** Fully hydrated runtime entity. */
export type RuntimeEntity = Entity<Record<string, unknown>>;

/**
 * Lightweight metadata for entity indexing.
 * Used in the primary index for O(1) lookups.
 */
export interface EntityMetadata {
  /** Entity ID */
  id: EntityId;

  /** Entity type */
  type: EntityType;

  /** Display title */
  title: string;

  /** Workstream */
  workstream: string;

  /** Current status */
  status: string;

  /** Whether archived */
  archived: boolean;

  /** Whether currently in progress */
  in_progress: boolean;

  /** Parent entity ID (if any) */
  parent_id?: EntityId;

  /** Number of child entities */
  children_count: number;

  /** Priority (if applicable) */
  priority?: string;

  /** Canvas source path */
  canvas_source: CanvasPath;

  /** Vault file path */
  vault_path: VaultPath;

  /** File modification time (epoch ms) */
  file_mtime: number;

  /** Created timestamp */
  created_at: string;

  /** Updated timestamp */
  updated_at: string;
}

// =============================================================================
// Filesystem abstraction (§5)
// =============================================================================

export interface FileStat {
  mtimeMs: number;
  size: number;
  isDirectory: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface Disposable {
  dispose(): void;
}

export interface FileSystem {
  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStat>;

  // Directory operations
  readDir(path: string): Promise<FileEntry[]>;
  createDir(path: string, options?: { recursive?: boolean }): Promise<void>;
  deleteDir(path: string, options?: { recursive?: boolean }): Promise<void>;

  // Batch operations
  readFiles(paths: string[]): Promise<Map<string, string>>;
  writeFiles(files: Map<string, string>): Promise<void>;

  // Watch (Plugin only)
  watch?(
    path: string,
    callback: (event: 'create' | 'modify' | 'delete', path: string) => void
  ): Disposable;
}

// =============================================================================
// Validation
// =============================================================================

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// =============================================================================
// Index seam (§13) — the collaborator interface the engine depends on.
// Production wires a real ProjectIndex; tests wire the harness InMemoryIndex.
// =============================================================================

export interface DuplicateGroup {
  id: EntityId;
  paths: VaultPath[];
}

export interface EntityIndex {
  // Core metadata storage
  get(id: EntityId): EntityMetadata | undefined;
  has(id: EntityId): boolean;
  set(metadata: EntityMetadata): void;
  delete(id: EntityId): boolean;
  clear(): void;

  // Bulk operations
  getAll(): EntityMetadata[];
  getAllIds(includeArchived?: boolean): EntityId[];
  getVersion(): number;
  readonly size: number;

  // Type-based queries
  getByType(type: EntityType): EntityMetadata[];
  getByStatus(status: string): EntityMetadata[];
  getByWorkstream(workstream: string): EntityMetadata[];
  getByParent(parentId: EntityId): EntityMetadata[];
  getByCanvas(canvasPath: CanvasPath): EntityMetadata[];
  getArchived(): EntityMetadata[];
  getInProgress(): EntityMetadata[];

  // File mapping operations
  getIdByPath(path: VaultPath): EntityId | undefined;
  getPathById(id: EntityId): VaultPath | null;
  getFileMtime(path: VaultPath): number | undefined;
  getAllPaths(): VaultPath[];
  removePathMapping(path: VaultPath): void;

  // Relationship operations
  addRelationship(from: EntityId, type: string, to: EntityId): void;
  getRelated(id: EntityId, type: string): EntityId[];
  getRelatedReverse(id: EntityId, type: string): EntityId[];
  removeForwardRelationships(id: EntityId, excludeTypes?: string[]): void;

  // Index maintenance
  /** Ids shared by more than one file (the collision set to repair). */
  findDuplicateIds(): DuplicateGroup[];
  /** Adjacency list source→targets for a named relationship's forward field. */
  buildAdjacency(
    relationshipName: string,
    direction?: 'forward' | 'reverse'
  ): Map<EntityId, EntityId[]>;
  reserveId(id: EntityId): void;
  isReserved(id: EntityId): boolean;
}

// =============================================================================
// Shared stub helper
// =============================================================================

/** Throw the canonical NOT_IMPLEMENTED error used by every engine stub. */
export function notImplemented(name: string): never {
  throw new Error(`NOT_IMPLEMENTED: ${name}`);
}
