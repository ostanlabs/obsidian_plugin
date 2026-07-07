/**
 * Contract suite K — ProjectIndex. (test-coverage backfill)
 *
 * Exercises the real in-memory index: primary storage, secondary indexes
 * (by_type/status/workstream/parent/canvas/priority + archived/in_progress),
 * the relationship graph (forward + reverse inverses), path↔id mappings,
 * duplicate detection, adjacency building, id reservation, and clear/version.
 *
 * These are pure in-memory assertions against ProjectIndex's public API
 * (read from src/entity-core/project-index.ts).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectIndex } from '../../src/entity-core/index.js';
import type { EntityMetadata } from '../../src/entity-core/types.js';

let seq = 0;
function meta(overrides: Partial<EntityMetadata> = {}): EntityMetadata {
  seq += 1;
  const id = overrides.id ?? `T-${String(seq).padStart(3, '0')}`;
  const type = overrides.type ?? 'task';
  return {
    id,
    type,
    title: overrides.title ?? `Title ${id}`,
    workstream: overrides.workstream ?? 'engineering',
    status: overrides.status ?? 'Not Started',
    archived: overrides.archived ?? false,
    in_progress: overrides.in_progress ?? false,
    parent_id: overrides.parent_id,
    children_count: overrides.children_count ?? 0,
    priority: overrides.priority,
    canvas_source: overrides.canvas_source ?? 'projects/main.canvas',
    vault_path: overrides.vault_path ?? `entities/${type}s/${id}.md`,
    file_mtime: overrides.file_mtime ?? 1000,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-02T00:00:00Z',
  };
}

describe('K. ProjectIndex', () => {
  let index: ProjectIndex;
  beforeEach(() => {
    index = new ProjectIndex();
  });

  describe('empty index', () => {
    it('starts empty at version 0 with no entities', () => {
      expect(index.size).toBe(0);
      expect(index.getVersion()).toBe(0);
      expect(index.getAllIds()).toEqual([]);
      expect(index.getAll()).toEqual([]);
      expect(index.get('T-001')).toBeUndefined();
      expect(index.has('T-001')).toBe(false);
      expect(index.getByType('task')).toEqual([]);
      expect(index.getByStatus('Not Started')).toEqual([]);
      expect(index.getByWorkstream('engineering')).toEqual([]);
      expect(index.getByParent('S-001')).toEqual([]);
      expect(index.getByCanvas('projects/main.canvas')).toEqual([]);
      expect(index.getArchived()).toEqual([]);
      expect(index.getInProgress()).toEqual([]);
      expect(index.getPathById('T-001')).toBeNull();
      expect(index.getIdByPath('x.md')).toBeUndefined();
      expect(index.getFileMtime('x.md')).toBeUndefined();
      expect(index.getAllPaths()).toEqual([]);
      expect(index.findDuplicateIds()).toEqual([]);
      expect(index.getRelated('T-001', 'blocks')).toEqual([]);
      expect(index.getRelatedReverse('T-001', 'blocks')).toEqual([]);
    });
  });

  describe('primary storage (set/get/has/delete)', () => {
    it('set adds an entity and bumps the version', () => {
      const m = meta({ id: 'T-100' });
      index.set(m);
      expect(index.get('T-100')).toBe(m);
      expect(index.has('T-100')).toBe(true);
      expect(index.size).toBe(1);
      expect(index.getVersion()).toBe(1);
      expect(index.getAllIds()).toEqual(['T-100']);
      expect(index.getAll()).toEqual([m]);
    });

    it('set replaces existing metadata and re-indexes secondary keys', () => {
      index.set(meta({ id: 'T-100', status: 'Not Started' }));
      expect(index.getByStatus('Not Started').map((e) => e.id)).toEqual(['T-100']);

      index.set(meta({ id: 'T-100', status: 'Completed' }));
      // old status bucket emptied, new one populated
      expect(index.getByStatus('Not Started')).toEqual([]);
      expect(index.getByStatus('Completed').map((e) => e.id)).toEqual(['T-100']);
      expect(index.size).toBe(1);
    });

    it('delete removes the entity and its mappings, returns true', () => {
      const m = meta({ id: 'T-100', vault_path: 'entities/tasks/T-100.md' });
      index.set(m);
      expect(index.delete('T-100')).toBe(true);
      expect(index.has('T-100')).toBe(false);
      expect(index.getPathById('T-100')).toBeNull();
      expect(index.getIdByPath('entities/tasks/T-100.md')).toBeUndefined();
      expect(index.getByType('task')).toEqual([]);
    });

    it('delete returns false for an unknown id', () => {
      expect(index.delete('nope')).toBe(false);
    });
  });

  describe('secondary indexes', () => {
    it('indexes by type, status, workstream, canvas, and priority', () => {
      index.set(meta({ id: 'T-1', type: 'task', status: 'In Progress', workstream: 'infra', priority: 'high', canvas_source: 'projects/a.canvas' }));
      index.set(meta({ id: 'S-1', type: 'story', status: 'In Progress', workstream: 'engineering', priority: 'high', canvas_source: 'projects/b.canvas' }));

      expect(index.getByType('task').map((e) => e.id)).toEqual(['T-1']);
      expect(index.getByType('story').map((e) => e.id)).toEqual(['S-1']);
      expect(index.getByStatus('In Progress').map((e) => e.id).sort()).toEqual(['S-1', 'T-1']);
      expect(index.getByWorkstream('infra').map((e) => e.id)).toEqual(['T-1']);
      expect(index.getByCanvas('projects/a.canvas').map((e) => e.id)).toEqual(['T-1']);
    });

    it('tracks archived and in_progress flag sets', () => {
      index.set(meta({ id: 'A-1', archived: true }));
      index.set(meta({ id: 'P-1', in_progress: true }));
      index.set(meta({ id: 'N-1' }));

      expect(index.getArchived().map((e) => e.id)).toEqual(['A-1']);
      expect(index.getInProgress().map((e) => e.id)).toEqual(['P-1']);
    });

    it('indexes children by parent_id', () => {
      index.set(meta({ id: 'S-1', type: 'story' }));
      index.set(meta({ id: 'T-1', type: 'task', parent_id: 'S-1' }));
      index.set(meta({ id: 'T-2', type: 'task', parent_id: 'S-1' }));

      expect(index.getByParent('S-1').map((e) => e.id).sort()).toEqual(['T-1', 'T-2']);
      expect(index.getByParent('S-999')).toEqual([]);
    });

    it('clears the archived/in_progress flags when re-set without them', () => {
      index.set(meta({ id: 'A-1', archived: true, in_progress: true }));
      expect(index.getArchived()).toHaveLength(1);
      expect(index.getInProgress()).toHaveLength(1);

      index.set(meta({ id: 'A-1', archived: false, in_progress: false }));
      expect(index.getArchived()).toEqual([]);
      expect(index.getInProgress()).toEqual([]);
    });
  });

  describe('path ↔ id mapping', () => {
    it('maps path→id and id→path bidirectionally', () => {
      index.set(meta({ id: 'T-1', vault_path: 'entities/tasks/T-1.md', file_mtime: 4242 }));
      expect(index.getIdByPath('entities/tasks/T-1.md')).toBe('T-1');
      expect(index.getPathById('T-1')).toBe('entities/tasks/T-1.md');
      expect(index.getFileMtime('entities/tasks/T-1.md')).toBe(4242);
      expect(index.getAllPaths()).toEqual(['entities/tasks/T-1.md']);
    });

    it('removePathMapping drops the stale path but keeps the entity', () => {
      index.set(meta({ id: 'T-1', vault_path: 'entities/tasks/T-1.md' }));
      index.removePathMapping('entities/tasks/T-1.md');
      expect(index.getIdByPath('entities/tasks/T-1.md')).toBeUndefined();
      expect(index.getFileMtime('entities/tasks/T-1.md')).toBeUndefined();
      // entity itself remains in the primary index
      expect(index.has('T-1')).toBe(true);
    });
  });

  describe('findDuplicateIds', () => {
    it('returns [] when all paths map to distinct ids', () => {
      index.set(meta({ id: 'T-1', vault_path: 'a.md' }));
      index.set(meta({ id: 'T-2', vault_path: 'b.md' }));
      expect(index.findDuplicateIds()).toEqual([]);
    });

    it('reports an id that maps from multiple paths', () => {
      // set() overwrites the id→path for T-1, but path→id keeps both entries
      // because each distinct path points at the same id.
      index.set(meta({ id: 'T-1', vault_path: 'entities/tasks/T-1_first.md' }));
      // Manually reproduce a title-forked duplicate: same id, different path.
      const dupe = meta({ id: 'T-1', vault_path: 'entities/tasks/T-1_second.md' });
      index.set(dupe);
      const groups = index.findDuplicateIds();
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('T-1');
      expect(groups[0].paths.sort()).toEqual(
        ['entities/tasks/T-1_first.md', 'entities/tasks/T-1_second.md'].sort()
      );
    });
  });

  describe('relationships (forward + reverse inverse)', () => {
    // NOTE: getReverseRelationType is now derived from the schema (buildReverseRelationMap):
    // depends_on↔blocks, parent↔children, implements↔implemented_by, affects↔decided_by, …
    // A field absent from the schema map acts as its own identity inverse.
    it('addRelationship records forward and schema-mapped reverse edges', () => {
      index.addRelationship('S-002', 'blocks', 'S-001');
      expect(index.getRelated('S-002', 'blocks')).toEqual(['S-001']);
      // schema inverse of `blocks` is `depends_on`
      expect(index.getRelatedReverse('S-001', 'depends_on')).toEqual(['S-002']);
    });

    it('uses the schema inverse for known pairs and identity for unknown fields', () => {
      // unknown field → identity inverse
      index.addRelationship('X-1', 'custom_rel', 'X-2');
      expect(index.getRelatedReverse('X-2', 'custom_rel')).toEqual(['X-1']);
      // depends_on↔blocks (schema pair): reverse of depends_on is stored under `blocks`
      index.addRelationship('S-001', 'depends_on', 'S-002');
      expect(index.getRelatedReverse('S-002', 'blocks')).toEqual(['S-001']);
      // parent↔children (schema pair)
      index.addRelationship('T-001', 'parent', 'S-009');
      expect(index.getRelatedReverse('S-009', 'children')).toEqual(['T-001']);
    });

    it('supports multiple targets on the same relationship', () => {
      index.addRelationship('S-001', 'depends_on', 'S-002');
      index.addRelationship('S-001', 'depends_on', 'S-003');
      expect(index.getRelated('S-001', 'depends_on').sort()).toEqual(['S-002', 'S-003']);
    });

    it('deleting an entity removes both its forward and reverse edges', () => {
      index.set(meta({ id: 'S-002', type: 'story' }));
      index.set(meta({ id: 'S-001', type: 'story' }));
      index.addRelationship('S-002', 'blocks', 'S-001');
      expect(index.getRelatedReverse('S-001', 'depends_on')).toEqual(['S-002']);

      index.delete('S-002');
      // S-001 should no longer list S-002 as a blocker
      expect(index.getRelatedReverse('S-001', 'depends_on')).toEqual([]);
    });

    it('deleting the target cleans up the source forward edge', () => {
      index.set(meta({ id: 'S-002', type: 'story' }));
      index.set(meta({ id: 'S-001', type: 'story' }));
      index.addRelationship('S-002', 'blocks', 'S-001');

      index.delete('S-001');
      expect(index.getRelated('S-002', 'blocks')).toEqual([]);
    });
  });

  describe('removeForwardRelationships', () => {
    it('removes forward edges and their reverse mappings', () => {
      index.addRelationship('S-001', 'blocks', 'S-002');
      index.addRelationship('S-001', 'implements', 'F-001');
      expect(index.getRelatedReverse('S-002', 'depends_on')).toEqual(['S-001']);
      index.removeForwardRelationships('S-001');
      expect(index.getRelated('S-001', 'blocks')).toEqual([]);
      expect(index.getRelated('S-001', 'implements')).toEqual([]);
      expect(index.getRelatedReverse('S-002', 'depends_on')).toEqual([]);
      expect(index.getRelatedReverse('F-001', 'implemented_by')).toEqual([]);
    });

    it('preserves excluded relationship types', () => {
      index.addRelationship('T-001', 'depends_on', 'T-002');
      index.addRelationship('T-001', 'parent_of', 'T-003');
      index.removeForwardRelationships('T-001', ['parent_of']);
      expect(index.getRelated('T-001', 'depends_on')).toEqual([]);
      expect(index.getRelated('T-001', 'parent_of')).toEqual(['T-003']);
    });

    it('is a no-op for an entity with no forward relationships', () => {
      expect(() => index.removeForwardRelationships('ghost')).not.toThrow();
      expect(index.getRelated('ghost', 'depends_on')).toEqual([]);
    });
  });

  describe('buildAdjacency', () => {
    it('builds a forward adjacency map for a relationship name', () => {
      index.addRelationship('S-001', 'depends_on', 'S-002');
      index.addRelationship('S-002', 'depends_on', 'S-003');
      const adj = index.buildAdjacency('depends_on', 'forward');
      expect(adj.get('S-001')).toEqual(['S-002']);
      expect(adj.get('S-002')).toEqual(['S-003']);
      expect(adj.has('S-003')).toBe(false);
    });

    it('builds a reverse adjacency map', () => {
      index.addRelationship('S-002', 'blocks', 'S-001');
      // reverse graph is keyed by target with the schema inverse (blocks → depends_on)
      const adj = index.buildAdjacency('depends_on', 'reverse');
      expect(adj.get('S-001')).toEqual(['S-002']);
    });
  });

  describe('reserveId / isReserved', () => {
    it('tracks reserved ids independently of stored entities', () => {
      expect(index.isReserved('T-500')).toBe(false);
      index.reserveId('T-500');
      expect(index.isReserved('T-500')).toBe(true);
      expect(index.has('T-500')).toBe(false);
    });
  });

  describe('clear', () => {
    it('empties primary, secondary, relationship, and file maps', () => {
      index.set(meta({ id: 'T-1' }));
      index.addRelationship('T-1', 'depends_on', 'T-2');
      const versionBefore = index.getVersion();

      index.clear();
      expect(index.size).toBe(0);
      expect(index.getAllIds()).toEqual([]);
      expect(index.getByType('task')).toEqual([]);
      expect(index.getRelated('T-1', 'depends_on')).toEqual([]);
      expect(index.getAllPaths()).toEqual([]);
      expect(index.getVersion()).toBe(versionBefore + 1);
    });
  });
});
