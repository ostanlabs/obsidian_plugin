/**
 * Project Index
 *
 * Provides in-memory indexing for fast entity lookups.
 * Implements primary index, secondary indexes, and relationship graph.
 * 
 * Ported from obsidian-mcp/src/services/v2/index-service.ts
 */

import {
  EntityId,
  EntityType,
  EntityMetadata,
  VaultPath,
  CanvasPath,
  EntityIndex,
  DuplicateGroup,
} from './types.js';

// =============================================================================
// Secondary Index Types
// =============================================================================

/** Secondary indexes for efficient filtering */
interface SecondaryIndexes {
  by_type: Map<EntityType, Set<EntityId>>;
  by_status: Map<string, Set<EntityId>>;
  by_workstream: Map<string, Set<EntityId>>;
  by_parent: Map<EntityId, Set<EntityId>>;
  by_canvas: Map<CanvasPath, Set<EntityId>>;
  archived: Set<EntityId>;
  in_progress: Set<EntityId>;
  by_priority: Map<string, Set<EntityId>>;
}

// =============================================================================
// Relationship Graph Types
// =============================================================================

type RelationshipType = string;

interface RelationshipGraph {
  forward: Map<EntityId, Map<RelationshipType, Set<EntityId>>>;
  reverse: Map<EntityId, Map<RelationshipType, Set<EntityId>>>;
}

// =============================================================================
// File Mapping Types
// =============================================================================

interface FileMappings {
  path_to_id: Map<VaultPath, EntityId>;
  id_to_path: Map<EntityId, VaultPath>;
  file_mtimes: Map<VaultPath, number>;
}

// =============================================================================
// Project Index Class
// =============================================================================

export class ProjectIndex implements EntityIndex {
  private primary: Map<EntityId, EntityMetadata> = new Map();
  private secondary: SecondaryIndexes;
  private relationships: RelationshipGraph;
  private files: FileMappings;
  private _version: number = 0;
  private lastRebuild: number = 0;
  private reservedIds: Set<EntityId> = new Set();

  constructor() {
    this.secondary = this.createEmptySecondaryIndexes();
    this.relationships = this.createEmptyRelationshipGraph();
    this.files = this.createEmptyFileMappings();
  }

  private createEmptySecondaryIndexes(): SecondaryIndexes {
    return {
      by_type: new Map(),
      by_status: new Map(),
      by_workstream: new Map(),
      by_parent: new Map(),
      by_canvas: new Map(),
      archived: new Set(),
      in_progress: new Set(),
      by_priority: new Map(),
    };
  }

  private createEmptyRelationshipGraph(): RelationshipGraph {
    return { forward: new Map(), reverse: new Map() };
  }

  private createEmptyFileMappings(): FileMappings {
    return {
      path_to_id: new Map(),
      id_to_path: new Map(),
      file_mtimes: new Map(),
    };
  }

  // Primary Index Operations
  get(id: EntityId): EntityMetadata | undefined { return this.primary.get(id); }
  has(id: EntityId): boolean { return this.primary.has(id); }
  getAllIds(): EntityId[] { return Array.from(this.primary.keys()); }
  getAll(): EntityMetadata[] { return Array.from(this.primary.values()); }
  get size(): number { return this.primary.size; }
  getVersion(): number { return this._version; }

  set(metadata: EntityMetadata): void {
    const existing = this.primary.get(metadata.id);
    if (existing) this.removeFromSecondaryIndexes(existing);
    this.primary.set(metadata.id, metadata);
    this.addToSecondaryIndexes(metadata);
    this.files.path_to_id.set(metadata.vault_path, metadata.id);
    this.files.id_to_path.set(metadata.id, metadata.vault_path);
    this.files.file_mtimes.set(metadata.vault_path, metadata.file_mtime);
    this._version++;
  }

  delete(id: EntityId): boolean {
    const metadata = this.primary.get(id);
    if (!metadata) return false;
    this.primary.delete(id);
    this.removeFromSecondaryIndexes(metadata);
    this.files.path_to_id.delete(metadata.vault_path);
    this.files.id_to_path.delete(id);
    this.files.file_mtimes.delete(metadata.vault_path);
    this.removeFromRelationships(id);
    this._version++;
    return true;
  }

  /** Remove a stale path mapping without deleting the entity (for duplicate cleanup) */
  removePathMapping(path: VaultPath): void {
    this.files.path_to_id.delete(path);
    this.files.file_mtimes.delete(path);
    this._version++;
  }

  clear(): void {
    this.primary.clear();
    this.secondary = this.createEmptySecondaryIndexes();
    this.relationships = this.createEmptyRelationshipGraph();
    this.files = this.createEmptyFileMappings();
    this._version++;
    this.lastRebuild = Date.now();
  }

