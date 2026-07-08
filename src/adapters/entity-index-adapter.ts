/**
 * EntityIndexAdapter - Wraps the plugin's EntityIndex to implement entity-core EntityIndex interface
 * 
 * This adapter allows the plugin's existing EntityIndex (from util/entityNavigator.ts) to work
 * with entity-core modules without needing to replace the entire index implementation.
 */

import type { EntityId, VaultPath, DuplicateGroup } from '../entity-core/types.js';
import type { EntityIndex as CoreEntityIndex } from '../entity-core/types.js';
import type { EntityIndex as PluginEntityIndex } from '../../util/entityNavigator.js';
import type { SchemaRegistry } from '../entity-core/schema-registry.js';

/**
 * The subset of the entity-core EntityIndex that is actually consumed by the
 * engine modules wired in EntityCoreFacade.initializeWithIndex (IDAllocator and
 * RelationshipGraph only call getAllIds/reserveId/isReserved/findDuplicateIds/
 * getPathById/buildAdjacency). The adapter genuinely implements exactly this
 * seam; the remaining EntityIndex storage surface (get/set/delete/...) is never
 * invoked on the adapter at runtime, so we implement the narrow contract rather
 * than fabricating unused delegates. Signatures are derived from the canonical
 * EntityIndex via Pick so they stay in sync.
 */
export type EngineIndexSeam = Pick<
  CoreEntityIndex,
  'getPathById' | 'getAllIds' | 'findDuplicateIds' | 'buildAdjacency' | 'reserveId' | 'isReserved'
>;

export class EntityIndexAdapter implements EngineIndexSeam {
  private reservedIds: Set<EntityId> = new Set();

  constructor(
    private readonly pluginIndex: PluginEntityIndex,
    private readonly schema: SchemaRegistry
  ) {}

  /**
   * Get path for an entity ID.
   * Returns null if the ID is not found in the index.
   */
  getPathById(id: EntityId): VaultPath | null {
    const entry = this.pluginIndex.get(id);
    return entry ? entry.file.path : null;
  }

  /**
   * Get all entity IDs.
   * CRITICAL (parity #6): When includeArchived is true, we must scan archived entities too.
   */
  getAllIds(includeArchived = false): EntityId[] {
    // The plugin's EntityIndex.buildIndex() already scans all files in the vault,
    // including those in archive folders. So we can just return all IDs.
    // If includeArchived is false, we filter out archived entities.
    const allIds: EntityId[] = [];
    
    // Get all entries from the plugin index
    const entries = this.pluginIndex.getAll();
    
    for (const entry of entries) {
      if (!includeArchived && entry.file.path.includes('/archive/')) {
        continue;
      }
      allIds.push(entry.id as EntityId);
    }
    
    return allIds;
  }

  /**
   * Find duplicate IDs (same ID used by multiple files).
   * Used for collision detection and repair.
   */
  findDuplicateIds(): DuplicateGroup[] {
    // Build a map of ID -> paths
    const idToPaths = new Map<EntityId, VaultPath[]>();
    
    // Scan all entries
    const entries = this.pluginIndex.getAll();
    for (const entry of entries) {
      const id = entry.id as EntityId;
      if (!idToPaths.has(id)) {
        idToPaths.set(id, []);
      }
      idToPaths.get(id)!.push(entry.file.path);
    }
    
    // Find duplicates (IDs with more than one path)
    const duplicates: DuplicateGroup[] = [];
    for (const [id, paths] of idToPaths) {
      if (paths.length > 1) {
        duplicates.push({ id, paths });
      }
    }
    
    return duplicates;
  }

  /**
   * Build adjacency list for a relationship.
   * Returns a map of source entity ID -> target entity IDs.
   */
  buildAdjacency(
    relationshipName: string,
    direction: 'forward' | 'reverse' = 'forward'
  ): Map<EntityId, EntityId[]> {
    const adjacency = new Map<EntityId, EntityId[]>();

    // Get the relationship definition from schema
    const rel = this.schema.getRelationship(relationshipName);
    if (!rel) {
      console.warn(`[EntityIndexAdapter] Unknown relationship: ${relationshipName}`);
      return adjacency;
    }

    // Collect the DISTINCT field names for this relationship in the given direction.
    // A relationship may declare several pairs that share one field name (e.g.
    // `dependency` has m→m/s→s/t→t all using `depends_on`); reading such a field once
    // per pair would emit each target N times, so de-dup the field-name set.
    const fieldNames = [
      ...new Set(rel.pairs.map((pair) => (direction === 'forward' ? pair.forward : pair.reverse))),
    ];

    // Scan all entries and build adjacency list
    const entries = this.pluginIndex.getAll();
    for (const entry of entries) {
      const sourceId = entry.id as EntityId;
      const targets: EntityId[] = [];

      // Check all field names for this relationship
      for (const fieldName of fieldNames) {
        // Get the relationship field value. Plugin entries store some fields as
        // arrays (depends_on/blocks/children) and others as a SCALAR string
        // (hierarchy `parent`). Wrap a scalar as a single-element list; spreading it
        // would explode the id string into its individual characters.
        const value = (entry as any)[fieldName] as string | string[] | undefined;

        if (Array.isArray(value)) {
          if (value.length > 0) targets.push(...(value as EntityId[]));
        } else if (typeof value === 'string' && value.length > 0) {
          targets.push(value as EntityId);
        }
      }

      if (targets.length > 0) {
        adjacency.set(sourceId, targets);
      }
    }

    return adjacency;
  }

  /**
   * Reserve an ID (mark it as allocated so it won't be reused).
   * Used by IDAllocator when creating new entities.
   */
  reserveId(id: EntityId): void {
    this.reservedIds.add(id);
  }

  /**
   * Check if an ID is reserved.
   */
  isReserved(id: EntityId): boolean {
    return this.reservedIds.has(id);
  }
}

/**
 * Helper: Extend the plugin's EntityIndex interface to add a getAll() method if needed.
 * This is a workaround since the plugin's EntityIndex doesn't expose a direct way to iterate all entries.
 * 
 * In practice, we'll need to either:
 * 1. Add getAll() method to plugin's EntityIndex
 * 2. Use a different approach to iterate entries
 * 
 * For now, assuming the plugin's index has a private `index` property that we can access.
 */
declare module '../../util/entityNavigator.js' {
  interface EntityIndex {
    getAll(): Array<{
      id: string;
      type: import('../../types.js').EntityType;
      file: import('obsidian').TFile;
      title: string;
      parent?: string;
      depends_on: string[];
      implements: string[];
      documents: string[];
      affects: string[];
      enables: string[];
      implemented_by: string[];
      documented_by: string[];
      decided_by: string[];
      blocks: string[];
      tier?: string;
      phase?: string;
    }>;
  }
}

