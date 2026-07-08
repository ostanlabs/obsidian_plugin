/**
 * Contract suite K2 — ProjectIndex coverage backfill (Phase 2a hardening).
 *
 * Pins the paths suite K leaves uncovered: setReverseRelationMap (custom-schema
 * inverse swap), constructor-injected reverse map, removal of secondary-index
 * entries for entities carrying parent_id/priority, dangling relationship
 * references, duplicate-edge idempotency, and buildAdjacency defaults/misses.
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

describe('K2. ProjectIndex — reverse-relation map wiring', () => {
  it('setReverseRelationMap replaces the schema-derived inverse map', () => {
    const index = new ProjectIndex();
    index.setReverseRelationMap({ likes: 'liked_by' });

    index.addRelationship('A-1', 'likes', 'B-1');
    expect(index.getRelatedReverse('B-1', 'liked_by')).toEqual(['A-1']);

    // depends_on is no longer in the map → falls back to identity inverse
    // (the default map would have stored it under `blocks`).
    index.addRelationship('A-1', 'depends_on', 'B-1');
    expect(index.getRelatedReverse('B-1', 'depends_on')).toEqual(['A-1']);
    expect(index.getRelatedReverse('B-1', 'blocks')).toEqual([]);
  });

  it('accepts a reverse map via the constructor (skips DEFAULT_SCHEMA derivation)', () => {
    const index = new ProjectIndex({ documents: 'documented_by' });
    index.addRelationship('DOC-001', 'documents', 'F-001');
    expect(index.getRelatedReverse('F-001', 'documented_by')).toEqual(['DOC-001']);

    // Fields absent from the injected map act as identity inverses.
    index.addRelationship('S-001', 'depends_on', 'S-002');
    expect(index.getRelatedReverse('S-002', 'depends_on')).toEqual(['S-001']);
    expect(index.getRelatedReverse('S-002', 'blocks')).toEqual([]);
  });

  it('swapping the map mid-stream only affects edges added afterwards', () => {
    const index = new ProjectIndex();
    index.addRelationship('S-002', 'blocks', 'S-001'); // stored reverse: depends_on
    index.setReverseRelationMap({}); // everything identity from here on
    index.addRelationship('S-003', 'blocks', 'S-001'); // stored reverse: blocks

    expect(index.getRelatedReverse('S-001', 'depends_on')).toEqual(['S-002']);
    expect(index.getRelatedReverse('S-001', 'blocks')).toEqual(['S-003']);
  });
});

describe('K2. ProjectIndex — secondary-index removal with parent_id/priority set', () => {
  let index: ProjectIndex;
  beforeEach(() => {
    index = new ProjectIndex();
  });

  it('delete removes the child from its parent bucket', () => {
    index.set(meta({ id: 'S-1', type: 'story' }));
    index.set(meta({ id: 'T-1', parent_id: 'S-1', priority: 'high' }));
    expect(index.getByParent('S-1').map((e) => e.id)).toEqual(['T-1']);

    index.delete('T-1');
    expect(index.getByParent('S-1')).toEqual([]);
  });

  it('re-set with a different parent moves the child between parent buckets', () => {
    index.set(meta({ id: 'T-1', parent_id: 'S-1' }));
    index.set(meta({ id: 'T-1', parent_id: 'S-2' }));
    expect(index.getByParent('S-1')).toEqual([]);
    expect(index.getByParent('S-2').map((e) => e.id)).toEqual(['T-1']);
  });

  it('re-set that drops parent_id/priority removes the old bucket entries', () => {
    index.set(meta({ id: 'T-1', parent_id: 'S-1', priority: 'high' }));
    index.set(meta({ id: 'T-1', parent_id: undefined, priority: undefined }));
    expect(index.getByParent('S-1')).toEqual([]);
    // entity itself unaffected
    expect(index.get('T-1')?.priority).toBeUndefined();
    expect(index.size).toBe(1);
  });

  it('re-set with a changed priority re-indexes without duplication', () => {
    index.set(meta({ id: 'T-1', priority: 'high' }));
    index.set(meta({ id: 'T-1', priority: 'low' }));
    expect(index.get('T-1')?.priority).toBe('low');
    expect(index.size).toBe(1);
  });
});

describe('K2. ProjectIndex — dangling references and duplicate edges', () => {
  let index: ProjectIndex;
  beforeEach(() => {
    index = new ProjectIndex();
  });

  it('stores relationship edges for ids that are not in the primary index', () => {
    // No set() calls at all — the graph is independent of primary storage.
    index.addRelationship('T-1', 'depends_on', 'GHOST-9');
    expect(index.getRelated('T-1', 'depends_on')).toEqual(['GHOST-9']);
    expect(index.getRelatedReverse('GHOST-9', 'blocks')).toEqual(['T-1']);
    expect(index.has('GHOST-9')).toBe(false);
  });

  it('parent_id referencing a missing entity still populates by_parent', () => {
    index.set(meta({ id: 'T-1', parent_id: 'S-404' }));
    expect(index.has('S-404')).toBe(false);
    expect(index.getByParent('S-404').map((e) => e.id)).toEqual(['T-1']);
  });

  it('adding the same edge twice is idempotent', () => {
    index.addRelationship('S-001', 'depends_on', 'S-002');
    index.addRelationship('S-001', 'depends_on', 'S-002');
    expect(index.getRelated('S-001', 'depends_on')).toEqual(['S-002']);
    expect(index.getRelatedReverse('S-002', 'blocks')).toEqual(['S-001']);
  });

  it('deleting a dangling target cleans the source forward edge', () => {
    index.set(meta({ id: 'GHOST-9', type: 'task', vault_path: 'entities/tasks/GHOST-9.md' }));
    index.addRelationship('T-1', 'depends_on', 'GHOST-9');
    index.delete('GHOST-9');
    expect(index.getRelated('T-1', 'depends_on')).toEqual([]);
  });
});

describe('K2. ProjectIndex — buildAdjacency defaults and misses', () => {
  it('defaults to the forward direction when direction is omitted', () => {
    const index = new ProjectIndex();
    index.addRelationship('S-001', 'depends_on', 'S-002');
    const adj = index.buildAdjacency('depends_on');
    expect(adj.get('S-001')).toEqual(['S-002']);
  });

  it('returns an empty map for an unknown relationship name', () => {
    const index = new ProjectIndex();
    index.addRelationship('S-001', 'depends_on', 'S-002');
    expect(index.buildAdjacency('nonexistent').size).toBe(0);
    expect(index.buildAdjacency('nonexistent', 'reverse').size).toBe(0);
  });

  it('skips sources whose target set does not include the requested name', () => {
    const index = new ProjectIndex();
    index.addRelationship('S-001', 'depends_on', 'S-002');
    index.addRelationship('S-003', 'implements', 'F-001');
    const adj = index.buildAdjacency('depends_on');
    expect([...adj.keys()]).toEqual(['S-001']);
  });
});

describe('K2. ProjectIndex — version bookkeeping', () => {
  it('removePathMapping bumps the version', () => {
    const index = new ProjectIndex();
    index.set(meta({ id: 'T-1', vault_path: 'a.md' }));
    const v = index.getVersion();
    index.removePathMapping('a.md');
    expect(index.getVersion()).toBe(v + 1);
  });

  it('delete bumps the version; failed delete does not', () => {
    const index = new ProjectIndex();
    index.set(meta({ id: 'T-1' }));
    const v = index.getVersion();
    expect(index.delete('nope')).toBe(false);
    expect(index.getVersion()).toBe(v);
    expect(index.delete('T-1')).toBe(true);
    expect(index.getVersion()).toBe(v + 1);
  });
});
