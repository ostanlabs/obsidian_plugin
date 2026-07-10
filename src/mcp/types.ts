/**
 * src/mcp/types.ts — shared contract for the multi-vault MCP layer.
 *
 * Wave-0 of MULTI_VAULT_MCP_IMPLEMENTATION_SPEC.md (§4.2, §15 W0): every
 * multi-vault work item (vault-engine, vault-registry, confine, workspaces,
 * reconcile) codes against THESE shapes. Change them only with a spec update.
 */

import type { MsrlEngine } from '@ostanlabs/md-retriever';
import type {
  Schema,
  FileSystem,
  EntityId,
  EntityType,
} from '../entity-core/types.js';
import type { SchemaRegistry } from '../entity-core/schema-registry.js';
import type { EntityParser } from '../entity-core/parser.js';
import type { EntitySerializer } from '../entity-core/serializer.js';
import type { EntityValidator } from '../entity-core/validator.js';
import type { PathResolver } from '../entity-core/path-resolver.js';
import type { IDAllocator } from '../entity-core/id-allocator.js';
import type { RelationshipGraph } from '../entity-core/relationship-graph.js';
import type { CanvasManager } from '../entity-core/canvas.js';
import type { ProjectIndex } from '../entity-core/project-index.js';

// =============================================================================
// Registry config (global mcp.json — spec §4.1)
// =============================================================================

export type ArchiveLayout = 'by-type' | 'quarterly';

/** One registered vault. Layout fields are persisted because real vaults use
 * non-default layouts (AgentPlatform: entitiesFolder '' = top-level folders). */
export interface VaultEntry {
  /** Stable kebab slug, unique across the registry; the `vault` tool argument. */
  id: string;
  name: string;
  /** Absolute vault root (confined to allowedRoots). */
  path: string;
  /** '' = type folders at the vault root; 'entities' = nested under entities/. */
  entitiesFolder: string;
  archiveFolder: string;
  archiveLayout: ArchiveLayout;
  canvasFolder: string;
  /** True for entries absorbed from VAULT_PATH / MCP roots (not persisted). */
  transient?: boolean;
}

export interface McpConfig {
  version: 1;
  /** Confinement roots. Only editable by hand in mcp.json — no tool widens them. */
  allowedRoots: string[];
  vaults: VaultEntry[];
}

// =============================================================================
// VaultEngine (spec §4.2/§5.2) — the per-vault bundle of entity-core modules
// =============================================================================

export interface VaultEngine {
  entry: VaultEntry;
  fs: FileSystem;
  schema: SchemaRegistry;
  index: ProjectIndex;
  parser: EntityParser;
  serializer: EntitySerializer;
  validator: EntityValidator;
  pathResolver: PathResolver;
  allocator: IDAllocator;
  relationshipGraph: RelationshipGraph;
  canvasManager: CanvasManager;
  /** From SchemaLoadResult — surfaced by get_schema. */
  schemaSource: 'file' | 'default';
  schemaErrors: string[];
  /** The live Schema object (kept in sync by applySchema). */
  activeSchema: Schema;
  /** Rebuild every schema-derived member (parser/serializer/validator/
   * pathResolver/validation allowlist + index reverse map). Port of mcp.ts. */
  applySchema(s: Schema): void;
  /** Schema-derived scan: archive first (recursive), then each type folder. */
  scanIndex(): Promise<void>;
  /** Lazy per-vault MSRL engine (embedding session shared across vaults). */
  msrl(): Promise<MsrlEngine>;
}

// =============================================================================
// Workspaces (spec §8) — <vault>/workspaces.json
// =============================================================================

export type Workspaces = Record<string, { path: string; description?: string }>;

// =============================================================================
// add_vault (spec §7)
// =============================================================================

export type BootstrapMode = 'auto' | 'always' | 'never';

/** Result of probing an existing directory in add_vault "auto"/adopt mode. */
export interface VaultDetection {
  /** absent | empty → scaffold; adopt otherwise. */
  kind: 'absent' | 'empty' | 'vault' | 'non-vault';
  entitiesFolder: string;
  archiveFolder: string;
  archiveLayout: ArchiveLayout;
  canvasFolder: string;
  hasSchemaJson: boolean;
  /** Type folders actually found on disk (relative to the vault root). */
  typeFolders: string[];
}

export interface AddVaultResult {
  vault: string;
  mode: 'created' | 'adopted' | 'registered';
  folders: string[];
  schemaVersion?: string | number;
}

// =============================================================================
// Reconciler (spec §9) — plan/result shapes
// =============================================================================

export interface ArchivePlanItem {
  id: EntityId;
  type: EntityType;
  /** Resolved from the OLD (pre-change) schema — the new one throws on removed types. */
  sourcePath: string;
  targetPath: string;
  /** Set when the target collided and a _dup-N suffix was planned. */
  renamedTo?: string;
}

export interface FileMovePlanItem {
  sourcePath: string;
  targetPath: string;
}

export interface DanglingRefItem {
  fromId: EntityId;
  relationship: string;
  toId: EntityId;
}

export interface ReconcilePlan {
  vault: string;
  typesAdded: EntityType[];
  typesRemoved: EntityType[];
  foldersToCreate: string[];
  entitiesToArchive: ArchivePlanItem[];
  fileMoves: FileMovePlanItem[];
  /** Targets that already exist; non-empty + policy 'refuse' aborts the apply. */
  collisions: string[];
  collisionPolicy: 'refuse' | 'suffix';
  danglingRefs: DanglingRefItem[];
  relsAdded: string[];
  relsRemoved: string[];
  schemaVersionFrom?: string | number;
  schemaVersionTo?: string | number;
}

export interface ReconcileResult {
  plan: ReconcilePlan;
  applied: true;
  archived: EntityId[];
  moved: string[];
  foldersCreated: string[];
  foldersRemoved: string[];
  tombstoned: EntityId[];
}

// =============================================================================
// Error taxonomy (spec §10) — loud, actionable; never silent no-op
// =============================================================================

export class VaultNotFound extends Error {
  constructor(ref: string, known: string[]) {
    super(
      `Vault '${ref}' is not registered (known: ${known.length ? known.join(', ') : 'none'}). ` +
        `Call list_vaults, or add it with add_vault.`
    );
    this.name = 'VaultNotFound';
  }
}

export class VaultPathMissing extends Error {
  constructor(id: string, path: string) {
    super(`Vault '${id}' points at a missing path: ${path}. Never auto-created — fix the path or re-add the vault.`);
    this.name = 'VaultPathMissing';
  }
}

export class PathNotConfined extends Error {
  constructor(input: string, allowedRoots: string[]) {
    super(`Path not within allowedRoots: ${input} (allowed: ${allowedRoots.join(', ') || 'none configured'})`);
    this.name = 'PathNotConfined';
  }
}

export class SchemaInvalid extends Error {
  constructor(errors: string[]) {
    super(`Schema rejected (last-good schema kept): ${errors.join('; ')}`);
    this.name = 'SchemaInvalid';
  }
}

/** Accept-then-match (D8): the payload's entity schema doesn't match the
 * RESOLVED vault's schema. The API layer accepted it; dispatch rejects it. */
export class SchemaMismatch extends Error {
  constructor(vault: string, offending: string, valid: string[]) {
    super(
      `${offending} does not match the schema of vault '${vault}' ` +
        `(valid: ${valid.join(', ')}). Call get_schema({vault: '${vault}'}).`
    );
    this.name = 'SchemaMismatch';
  }
}

export class ReconcileCollision extends Error {
  constructor(targets: string[]) {
    super(`Reconcile refused — target paths already exist: ${targets.join(', ')}. Nothing was written.`);
    this.name = 'ReconcileCollision';
  }
}

export class ConfigCorrupt extends Error {
  constructor(path: string, cause: string) {
    super(`Global MCP config is corrupt at ${path}: ${cause}. Refusing to start with an empty registry — restore the .bak or fix the file.`);
    this.name = 'ConfigCorrupt';
  }
}
