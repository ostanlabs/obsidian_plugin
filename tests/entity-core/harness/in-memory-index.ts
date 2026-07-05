/**
 * InMemoryIndex — real harness implementation of the EntityIndex seam.
 *
 * Lets relationship/allocator/migration tests seed observable index state (id→path,
 * archived flag, relationship edges) without standing up a real ProjectIndex.
 * Production wires a real ProjectIndex implementing the same interface.
 */

import type {
  DuplicateGroup,
  EntityId,
  EntityIndex,
  VaultPath,
} from '../../src/types.js';

export interface IndexEntry {
  id: EntityId;
  path: VaultPath;
  archived?: boolean;
  /** Relationship field → target ids, e.g. { depends_on: ['S-002'], parent: 'M-001' }. */
  relationships?: Record<string, EntityId | EntityId[]>;
  /** Relationship name → forward field name present on this entry (for adjacency). */
  forwardFields?: Record<string, string>;
}

export class InMemoryIndex implements EntityIndex {
  private entries: IndexEntry[];

  constructor(entries: IndexEntry[] = []) {
    this.entries = entries;
  }

  add(entry: IndexEntry): void {
    this.entries.push(entry);
  }

  getPathById(id: EntityId): VaultPath | null {
    const first = this.entries.find((e) => e.id === id);
    return first ? first.path : null;
  }

  getAllIds(includeArchived = true): EntityId[] {
    return this.entries
      .filter((e) => includeArchived || !e.archived)
      .map((e) => e.id);
  }

  findDuplicateIds(): DuplicateGroup[] {
    const byId = new Map<EntityId, VaultPath[]>();
    for (const e of this.entries) {
      const list = byId.get(e.id) ?? [];
      list.push(e.path);
      byId.set(e.id, list);
    }
    const groups: DuplicateGroup[] = [];
    for (const [id, paths] of byId) {
      if (paths.length > 1) groups.push({ id, paths });
    }
    return groups;
  }

  buildAdjacency(
    relationshipName: string,
    _direction: 'forward' | 'reverse' = 'forward'
  ): Map<EntityId, EntityId[]> {
    const adj = new Map<EntityId, EntityId[]>();
    for (const e of this.entries) {
      const field = e.forwardFields?.[relationshipName];
      if (!field) continue;
      const value = e.relationships?.[field];
      if (value === undefined) continue;
      const targets = Array.isArray(value) ? value : [value];
      adj.set(e.id, targets);
    }
    return adj;
  }

  private reserved = new Set<EntityId>();
  reserveId(id: EntityId): void {
    this.reserved.add(id);
  }
  isReserved(id: EntityId): boolean {
    return this.reserved.has(id);
  }
}
