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

export class EntityIndexAdapter implements CoreEntityIndex {
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
    
    // Determine which field to read based on direction
    const fieldName = direction === 'forward' ? rel.forwardField : rel.inverseField;
    
    // Scan all entries and build adjacency list
    const entries = this.pluginIndex.getAll();
    for (const entry of entries) {
      const sourceId = entry.id as EntityId;
      
      // Get the relationship field value (array of target IDs)
      // Note: plugin's EntityIndexEntry stores relationship arrays as string[]
      const targetIds = (entry as any)[fieldName] as string[] | undefined;
      
      if (targetIds && targetIds.length > 0) {
        adjacency.set(sourceId, targetIds as EntityId[]);
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

