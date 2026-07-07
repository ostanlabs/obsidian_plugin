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
import { DEFAULT_SCHEMA } from './default-schema.js';
import { buildReverseRelationMap } from './schema-derivation.js';

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
  /** field → inverse field, derived from the active schema (single source of truth). */
  private reverseRelMap: Record<string, string>;

  constructor(reverseRelationMap?: Record<string, string>) {
    this.secondary = this.createEmptySecondaryIndexes();
    this.relationships = this.createEmptyRelationshipGraph();
    this.files = this.createEmptyFileMappings();
    this.reverseRelMap = reverseRelationMap ?? buildReverseRelationMap(DEFAULT_SCHEMA);
  }

  /**
   * Replace the field→inverse map (e.g. after loading a custom schema.json), so the
   * reverse relationship graph stays consistent with the active schema. Call before
   * (re)building the index.
   */
  setReverseRelationMap(map: Record<string, string>): void {
    this.reverseRelMap = map;
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

  // Helper to add to set-based index
  private addToSetIndex<K>(map: Map<K, Set<EntityId>>, key: K, id: EntityId): void {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(id);
  }

  // Helper to remove from set-based index
  private removeFromSetIndex<K>(map: Map<K, Set<EntityId>>, key: K, id: EntityId): void {
    const set = map.get(key);
    if (set) { set.delete(id); if (set.size === 0) map.delete(key); }
  }

  private addToSecondaryIndexes(metadata: EntityMetadata): void {
    this.addToSetIndex(this.secondary.by_type, metadata.type, metadata.id);
    this.addToSetIndex(this.secondary.by_status, metadata.status, metadata.id);
    this.addToSetIndex(this.secondary.by_workstream, metadata.workstream, metadata.id);
    if (metadata.parent_id) this.addToSetIndex(this.secondary.by_parent, metadata.parent_id, metadata.id);
    this.addToSetIndex(this.secondary.by_canvas, metadata.canvas_source, metadata.id);
    if (metadata.archived) this.secondary.archived.add(metadata.id);
    if (metadata.in_progress) this.secondary.in_progress.add(metadata.id);
    if (metadata.priority) this.addToSetIndex(this.secondary.by_priority, metadata.priority, metadata.id);
  }

  private removeFromSecondaryIndexes(metadata: EntityMetadata): void {
    this.removeFromSetIndex(this.secondary.by_type, metadata.type, metadata.id);
    this.removeFromSetIndex(this.secondary.by_status, metadata.status, metadata.id);
    this.removeFromSetIndex(this.secondary.by_workstream, metadata.workstream, metadata.id);
    if (metadata.parent_id) this.removeFromSetIndex(this.secondary.by_parent, metadata.parent_id, metadata.id);
    this.removeFromSetIndex(this.secondary.by_canvas, metadata.canvas_source, metadata.id);
    this.secondary.archived.delete(metadata.id);
    this.secondary.in_progress.delete(metadata.id);
    if (metadata.priority) this.removeFromSetIndex(this.secondary.by_priority, metadata.priority, metadata.id);
  }

  private removeFromRelationships(id: EntityId): void {
    // Remove all forward relationships
    const forwardRels = this.relationships.forward.get(id);
    if (forwardRels) {
      for (const [relType, targets] of forwardRels) {
        for (const target of targets) {
          const reverseRels = this.relationships.reverse.get(target);
          if (reverseRels) {
            const reverseType = this.getReverseRelationType(relType);
            reverseRels.get(reverseType)?.delete(id);
          }
        }
      }
      this.relationships.forward.delete(id);
    }
    // Remove all reverse relationships
    const reverseRels = this.relationships.reverse.get(id);
    if (reverseRels) {
      for (const [relType, sources] of reverseRels) {
        for (const source of sources) {
          const forwardRels = this.relationships.forward.get(source);
          if (forwardRels) {
            const forwardType = this.getReverseRelationType(relType);
            forwardRels.get(forwardType)?.delete(id);
          }
        }
      }
      this.relationships.reverse.delete(id);
    }
  }

  /**
   * Remove only forward relationships for an entity (relationships where this entity is the source).
   * This is used when re-indexing an entity's relationships without losing relationships
   * where this entity is the target (e.g., parent_of relationships from children).
   *
   * @param excludeTypes - Relationship types to exclude from removal. Use this to preserve
   *                       relationships that are "owned" by other entities (e.g., parent_of
   *                       is owned by children, not parents).
   */
  removeForwardRelationships(id: EntityId, excludeTypes?: string[]): void {
    const forwardRels = this.relationships.forward.get(id);
    if (forwardRels) {
      const excludeSet = new Set(excludeTypes || []);
      for (const [relType, targets] of forwardRels) {
        // Skip excluded relationship types
        if (excludeSet.has(relType)) continue;

        for (const target of targets) {
          const reverseRels = this.relationships.reverse.get(target);
          if (reverseRels) {
            const reverseType = this.getReverseRelationType(relType);
            reverseRels.get(reverseType)?.delete(id);
          }
        }
        forwardRels.delete(relType);
      }
      // Only delete the forward map if it's empty
      if (forwardRels.size === 0) {
        this.relationships.forward.delete(id);
      }
    }
  }

  private getReverseRelationType(type: RelationshipType): RelationshipType {
    // Inverse is derived from the active schema (see buildReverseRelationMap).
    // Unknown fields act as their own identity inverse.
    return this.reverseRelMap[type] || type;
  }

  // Secondary Index Query Methods
  getByType(type: EntityType): EntityMetadata[] {
    const ids = this.secondary.by_type.get(type);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getByStatus(status: string): EntityMetadata[] {
    const ids = this.secondary.by_status.get(status);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getByWorkstream(workstream: string): EntityMetadata[] {
    const ids = this.secondary.by_workstream.get(workstream);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getByParent(parentId: EntityId): EntityMetadata[] {
    const ids = this.secondary.by_parent.get(parentId);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getByCanvas(canvasPath: CanvasPath): EntityMetadata[] {
    const ids = this.secondary.by_canvas.get(canvasPath);
    return ids ? Array.from(ids).map(id => this.primary.get(id)!).filter(Boolean) : [];
  }

  getArchived(): EntityMetadata[] {
    return Array.from(this.secondary.archived).map(id => this.primary.get(id)!).filter(Boolean);
  }

  getInProgress(): EntityMetadata[] {
    return Array.from(this.secondary.in_progress).map(id => this.primary.get(id)!).filter(Boolean);
  }

  // Relationship Operations
  addRelationship(from: EntityId, type: RelationshipType, to: EntityId): void {
    // Add forward relationship
    let forwardRels = this.relationships.forward.get(from);
    if (!forwardRels) { forwardRels = new Map(); this.relationships.forward.set(from, forwardRels); }
    let targets = forwardRels.get(type);
    if (!targets) { targets = new Set(); forwardRels.set(type, targets); }
    targets.add(to);

    // Add reverse relationship
    const reverseType = this.getReverseRelationType(type);
    let reverseRels = this.relationships.reverse.get(to);
    if (!reverseRels) { reverseRels = new Map(); this.relationships.reverse.set(to, reverseRels); }
    let sources = reverseRels.get(reverseType);
    if (!sources) { sources = new Set(); reverseRels.set(reverseType, sources); }
    sources.add(from);
  }

  getRelated(id: EntityId, type: RelationshipType): EntityId[] {
    const rels = this.relationships.forward.get(id);
    return rels?.get(type) ? Array.from(rels.get(type)!) : [];
  }

  getRelatedReverse(id: EntityId, type: RelationshipType): EntityId[] {
    const rels = this.relationships.reverse.get(id);
    return rels?.get(type) ? Array.from(rels.get(type)!) : [];
  }

  // File Mapping Operations
  getIdByPath(path: VaultPath): EntityId | undefined { return this.files.path_to_id.get(path); }
  getPathById(id: EntityId): VaultPath | null { return this.files.id_to_path.get(id) ?? null; }
  getFileMtime(path: VaultPath): number | undefined { return this.files.file_mtimes.get(path); }
  getAllPaths(): VaultPath[] { return Array.from(this.files.path_to_id.keys()); }

  // Index Maintenance
  findDuplicateIds(): DuplicateGroup[] {
    const idToPaths = new Map<EntityId, VaultPath[]>();
    for (const [path, id] of this.files.path_to_id) {
      if (!idToPaths.has(id)) idToPaths.set(id, []);
      idToPaths.get(id)!.push(path);
    }
    const duplicates: DuplicateGroup[] = [];
    for (const [id, paths] of idToPaths) {
      if (paths.length > 1) duplicates.push({ id, paths });
    }
    return duplicates;
  }

  buildAdjacency(relationshipName: string, direction: 'forward' | 'reverse' = 'forward'): Map<EntityId, EntityId[]> {
    const adjacency = new Map<EntityId, EntityId[]>();
    const graph = direction === 'forward' ? this.relationships.forward : this.relationships.reverse;

    for (const [id, rels] of graph) {
      const targets = rels.get(relationshipName);
      if (targets && targets.size > 0) {
        adjacency.set(id, Array.from(targets));
      }
    }
    return adjacency;
  }

  reserveId(id: EntityId): void {
    this.reservedIds.add(id);
  }

  isReserved(id: EntityId): boolean {
    return this.reservedIds.has(id);
  }
}

