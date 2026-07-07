/**
 * EntityIndexAdapter — bridges the plugin's EntityIndex (util/entityNavigator) to the
 * entity-core EntityIndex seam consumed by IDAllocator + RelationshipGraph.
 *
 * Most cases seed the plugin's REAL EntityIndex from a harness vault (via
 * createTestApp + buildIndex) and assert the adapter maps ids/paths/adjacency
 * correctly. findDuplicateIds is driven with a tiny fake pluginIndex, since the
 * real index is a Map keyed by id and therefore cannot itself hold a collision.
 */

jest.mock('obsidian', () => require('../harness/obsidian-mock'), { virtual: true });

import { EntityIndexAdapter } from '../../src/adapters/entity-index-adapter';
import { SchemaRegistry } from '../../src/entity-core/schema-registry';
import { DEFAULT_SCHEMA } from '../../src/entity-core/default-schema';
import { EntityIndex } from '../../util/entityNavigator';
import { createTestApp } from '../harness/obsidian-mock';

function fm(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields).map(([k, v]) =>
    Array.isArray(v) ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`
  );
  return `---\n${lines.join('\n')}\n---\n`;
}

async function buildAdapter(seed: Record<string, string>): Promise<EntityIndexAdapter> {
  const app = createTestApp(seed);
  const idx = new EntityIndex(app as any, {} as any);
  await idx.buildIndex();
  const schema = new SchemaRegistry(DEFAULT_SCHEMA);
  return new EntityIndexAdapter(idx, schema);
}

const schema = new SchemaRegistry(DEFAULT_SCHEMA);

describe('EntityIndexAdapter', () => {
  describe('getPathById', () => {
    it('returns the vault path for a known id', async () => {
      const adapter = await buildAdapter({
        'entities/milestones/M-001_root.md': fm({ id: 'M-001', type: 'milestone', title: 'Root' }),
      });
      expect(adapter.getPathById('M-001')).toBe('entities/milestones/M-001_root.md');
    });

    it('returns null for an unknown id', async () => {
      const adapter = await buildAdapter({});
      expect(adapter.getPathById('M-999')).toBeNull();
    });
  });

  describe('getAllIds', () => {
    it('returns all active ids, excluding archived by default', async () => {
      const adapter = await buildAdapter({
        'entities/milestones/M-001_a.md': fm({ id: 'M-001', type: 'milestone', title: 'A' }),
        'entities/stories/S-001_b.md': fm({ id: 'S-001', type: 'story', title: 'B' }),
        'entities/archive/milestones/M-002_old.md': fm({ id: 'M-002', type: 'milestone', title: 'Old' }),
      });
      expect(adapter.getAllIds().sort()).toEqual(['M-001', 'S-001']);
    });

    it('includes archived entities when includeArchived=true', async () => {
      const adapter = await buildAdapter({
        'entities/milestones/M-001_a.md': fm({ id: 'M-001', type: 'milestone', title: 'A' }),
        'entities/archive/milestones/M-002_old.md': fm({ id: 'M-002', type: 'milestone', title: 'Old' }),
      });
      expect(adapter.getAllIds(true).sort()).toEqual(['M-001', 'M-002']);
    });

    it('returns [] for an empty index', async () => {
      const adapter = await buildAdapter({});
      expect(adapter.getAllIds()).toEqual([]);
    });
  });

  describe('buildAdjacency', () => {
    // Dedup: the dependency/implementation relationships have multiple pairs that
    // share ONE forward field name, and the adapter emits an edge per pair (see the
    // KNOWN BUG test below). We assert the semantic edge set here by de-duplicating.
    const edges = (arr: string[] | undefined) => [...new Set(arr ?? [])];

    it('maps forward edges for the dependency relationship (depends_on)', async () => {
      const adapter = await buildAdapter({
        'S-001.md': fm({ id: 'S-001', type: 'story', title: 'A' }),
        'S-002.md': fm({ id: 'S-002', type: 'story', title: 'B', depends_on: ['S-001'] }),
        'S-003.md': fm({ id: 'S-003', type: 'story', title: 'C', depends_on: ['S-001', 'S-002'] }),
      });
      const adj = adapter.buildAdjacency('dependency', 'forward');
      expect(edges(adj.get('S-002'))).toEqual(['S-001']);
      expect(edges(adj.get('S-003'))).toEqual(['S-001', 'S-002']);
      // S-001 has no depends_on → absent from the map.
      expect(adj.has('S-001')).toBe(false);
    });

    it('maps reverse edges from the inverse field (blocks)', async () => {
      const adapter = await buildAdapter({
        'S-001.md': fm({ id: 'S-001', type: 'story', title: 'A', blocks: ['S-002'] }),
        'S-002.md': fm({ id: 'S-002', type: 'story', title: 'B' }),
      });
      const adj = adapter.buildAdjacency('dependency', 'reverse');
      expect(edges(adj.get('S-001'))).toEqual(['S-002']);
      expect(adj.has('S-002')).toBe(false);
    });

    it('defaults to forward direction when omitted', async () => {
      const adapter = await buildAdapter({
        'S-001.md': fm({ id: 'S-001', type: 'story', title: 'A' }),
        'S-002.md': fm({ id: 'S-002', type: 'story', title: 'B', depends_on: ['S-001'] }),
      });
      expect(edges(adapter.buildAdjacency('dependency').get('S-002'))).toEqual(['S-001']);
    });

    it('warns and returns an empty map for an unknown relationship', async () => {
      const adapter = await buildAdapter({
        'S-001.md': fm({ id: 'S-001', type: 'story', title: 'A' }),
      });
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const adj = adapter.buildAdjacency('does-not-exist');
      expect(adj.size).toBe(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown relationship'));
      warn.mockRestore();
    });

    it('covers sources from multiple pairs of one relationship (implementation: implements)', async () => {
      const adapter = await buildAdapter({
        'M-001.md': fm({ id: 'M-001', type: 'milestone', title: 'M', implements: ['F-001'] }),
        'S-001.md': fm({ id: 'S-001', type: 'story', title: 'S', implements: ['F-001'] }),
        'F-001.md': fm({ id: 'F-001', type: 'feature', title: 'F' }),
      });
      const adj = adapter.buildAdjacency('implementation', 'forward');
      expect(edges(adj.get('M-001'))).toEqual(['F-001']);
      expect(edges(adj.get('S-001'))).toEqual(['F-001']);
    });

    /**
     * KNOWN BUG #1 (reported, not fixed): buildAdjacency collects field names as
     * `rel.pairs.map(pair => pair.forward)` WITHOUT de-duplicating. Every relationship
     * whose pairs share one field name (dependency has 3 pairs all `depends_on`)
     * therefore reads the same entry field once per pair, duplicating each target.
     * Harmless for cycle/reachability queries (visited-guarded), but the adjacency
     * list is not the expected edge set. Pinned here to make the defect visible.
     */
    it('duplicates each target once per same-named pair (KNOWN BUG #1)', async () => {
      const adapter = await buildAdapter({
        'S-001.md': fm({ id: 'S-001', type: 'story', title: 'A' }),
        'S-002.md': fm({ id: 'S-002', type: 'story', title: 'B', depends_on: ['S-001'] }),
      });
      // dependency has 3 pairs (m→m, s→s, t→t) all with forward field `depends_on`.
      expect(adapter.buildAdjacency('dependency', 'forward').get('S-002')).toEqual([
        'S-001',
        'S-001',
        'S-001',
      ]);
    });

    /**
     * KNOWN BUG #2 (reported, not fixed): the hierarchy `parent` field is stored on
     * the plugin entry as a SCALAR string, but buildAdjacency treats every field as
     * `string[]` and does `targets.push(...value)` — spreading the id string into its
     * individual characters. Compounded with BUG #1 (two hierarchy pairs both named
     * `parent`), the scalar is spread twice. Asserted qualitatively.
     */
    it('spreads the scalar `parent` id into characters on hierarchy (KNOWN BUG #2)', async () => {
      const adapter = await buildAdapter({
        'M-001.md': fm({ id: 'M-001', type: 'milestone', title: 'M' }),
        'S-001.md': fm({ id: 'S-001', type: 'story', title: 'S', parent: 'M-001' }),
      });
      const targets = adapter.buildAdjacency('hierarchy', 'forward').get('S-001');
      // Correct behaviour would be ['M-001']; instead we get spread characters.
      expect(targets).not.toEqual(['M-001']);
      expect(targets).not.toContain('M-001');
      expect(targets).toContain('M');
      expect(targets).toContain('-');
    });
  });

  describe('reserveId / isReserved', () => {
    it('tracks reserved ids independently of the index', async () => {
      const adapter = await buildAdapter({});
      expect(adapter.isReserved('T-050')).toBe(false);
      adapter.reserveId('T-050');
      expect(adapter.isReserved('T-050')).toBe(true);
      // Unrelated id stays unreserved.
      expect(adapter.isReserved('T-051')).toBe(false);
    });
  });

  describe('findDuplicateIds', () => {
    it('reports ids shared by more than one path and ignores unique ids', () => {
      // A fake pluginIndex whose getAll() can hold a genuine collision (the real
      // Map-backed index cannot). The adapter only calls get()/getAll().
      const entries = [
        { id: 'M-001', file: { path: 'a/M-001.md' } },
        { id: 'M-001', file: { path: 'b/M-001.md' } },
        { id: 'S-001', file: { path: 'S-001.md' } },
      ];
      const fake = {
        get: (id: string) => entries.find((e) => e.id === id),
        getAll: () => entries,
      } as any;
      const adapter = new EntityIndexAdapter(fake, schema);
      const dupes = adapter.findDuplicateIds();
      expect(dupes).toHaveLength(1);
      expect(dupes[0].id).toBe('M-001');
      expect(dupes[0].paths.sort()).toEqual(['a/M-001.md', 'b/M-001.md']);
    });

    it('returns [] when there are no duplicates', async () => {
      const adapter = await buildAdapter({
        'M-001.md': fm({ id: 'M-001', type: 'milestone', title: 'M' }),
        'S-001.md': fm({ id: 'S-001', type: 'story', title: 'S' }),
      });
      expect(adapter.findDuplicateIds()).toEqual([]);
    });
  });
});
