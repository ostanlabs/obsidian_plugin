/**
 * Contract suite D2 — RelationshipGraph coverage backfill.
 *
 * Extends suite D with the uncovered branches: link (success + unknown field),
 * unlink (success + unknown field + missing source), the addInverseReference
 * variants (no frontmatter, scalar→array, already-present) and the
 * removeInverseReference variants (delete-last, collapse-to-scalar, keep-array,
 * scalar-match, absent field), the "target not in index" early return,
 * wouldCreateCycle's no-cycle path, and applyTransitiveReduction guards.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SchemaRegistry,
  RelationshipGraph,
  PathResolver,
  DEFAULT_SCHEMA,
} from '../../src/entity-core/index.js';
import type { PathResolverConfig } from '../../src/entity-core/path-resolver.js';
import { InMemoryFileSystem } from './harness/in-memory-fs.js';
import { InMemoryIndex } from './harness/in-memory-index.js';
import { makeEntity } from './harness/entity-factory.js';

const CONFIG: PathResolverConfig = {
  vaultPath: '/vault',
  entitiesFolder: 'entities',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

function rawEntity(
  id: string,
  type: string,
  rels: Record<string, string | string[]> = {}
): string {
  const lines = Object.entries(rels).map(([k, v]) =>
    Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${x}`).join('\n')}` : `${k}: ${v}`
  );
  return `---\nid: ${id}\ntype: ${type}\ntitle: ${id}\nstatus: Not Started\nworkstream: engineering\ncreated_at: 2026-01-01T00:00:00Z\nupdated_at: 2026-01-01T00:00:00Z\narchived: false\nvault_path: entities/${type}s/${id}.md\ncanvas_source: projects/main.canvas\n${lines.join('\n')}\n---\n\n# Body\n`;
}

describe('D2. RelationshipGraph — extra branches', () => {
  let reg: SchemaRegistry;
  let resolver: PathResolver;
  beforeEach(() => {
    reg = new SchemaRegistry(DEFAULT_SCHEMA);
    resolver = new PathResolver(reg, CONFIG);
  });

  describe('link', () => {
    it('writes the field and syncs the inverse when no cycle results', async () => {
      const fs = new InMemoryFileSystem({
        '/vault/entities/stories/S-001_a.md': rawEntity('S-001', 'story', { depends_on: 'PLACEHOLDER' }),
        '/vault/entities/stories/S-002_b.md': rawEntity('S-002', 'story'),
      });
      const index = new InMemoryIndex([
        { id: 'S-001', path: '/vault/entities/stories/S-001_a.md' },
        { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
      ]);
      const graph = new RelationshipGraph(reg, index);

      await graph.link('S-001', 'depends_on', 'S-002', fs, resolver);

      const source = await fs.readFile('/vault/entities/stories/S-001_a.md');
      expect(source).toMatch(/depends_on: S-002/);
      const target = await fs.readFile('/vault/entities/stories/S-002_b.md');
      expect(target).toMatch(/blocks:/);
      expect(target).toContain('S-001');
    });

    it('throws for an unknown relationship field', async () => {
      const fs = new InMemoryFileSystem();
      const index = new InMemoryIndex([]);
      const graph = new RelationshipGraph(reg, index);
      await expect(graph.link('S-001', 'not_a_field', 'S-002', fs, resolver)).rejects.toThrow(
        /Unknown relationship field/
      );
    });

    it('throws when the source entity is not in the index', async () => {
      const fs = new InMemoryFileSystem();
      const index = new InMemoryIndex([]);
      const graph = new RelationshipGraph(reg, index);
      await expect(graph.link('S-404', 'depends_on', 'S-002', fs, resolver)).rejects.toThrow(
        /Source entity not found/
      );
    });
  });

  describe('unlink', () => {
    it('removes the target line from source and clears the inverse', async () => {
      const fs = new InMemoryFileSystem({
        '/vault/entities/stories/S-001_a.md': rawEntity('S-001', 'story', { depends_on: ['S-002'] }),
        '/vault/entities/stories/S-002_b.md': rawEntity('S-002', 'story', { blocks: ['S-001'] }),
      });
      const index = new InMemoryIndex([
        { id: 'S-001', path: '/vault/entities/stories/S-001_a.md' },
        { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
      ]);
      const graph = new RelationshipGraph(reg, index);

      await graph.unlink('S-001', 'depends_on', 'S-002', fs, resolver);

      const target = await fs.readFile('/vault/entities/stories/S-002_b.md');
      expect(target).not.toContain('S-001'); // inverse removed (blocks field dropped)
    });

    it('throws for an unknown relationship field', async () => {
      const fs = new InMemoryFileSystem();
      const graph = new RelationshipGraph(reg, new InMemoryIndex([]));
      await expect(graph.unlink('S-001', 'not_a_field', 'S-002', fs, resolver)).rejects.toThrow(
        /Unknown relationship field/
      );
    });

    it('is a no-op (no throw) when the source is not in the index', async () => {
      const fs = new InMemoryFileSystem();
      const graph = new RelationshipGraph(reg, new InMemoryIndex([]));
      await expect(graph.unlink('S-404', 'depends_on', 'S-002', fs, resolver)).resolves.toBeUndefined();
    });
  });

  describe('addInverseReference variants (via syncBidirectional)', () => {
    it('skips a target that has no frontmatter', async () => {
      const fs = new InMemoryFileSystem({
        '/vault/entities/stories/S-002_b.md': 'no frontmatter here',
      });
      const index = new InMemoryIndex([
        { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
      ]);
      const graph = new RelationshipGraph(reg, index);
      const src = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });

      await graph.syncBidirectional(src, null, fs, resolver);
      // Unchanged — no frontmatter to patch.
      expect(await fs.readFile('/vault/entities/stories/S-002_b.md')).toBe('no frontmatter here');
    });

    it('skips a target that is not registered in the index', async () => {
      const fs = new InMemoryFileSystem({});
      const index = new InMemoryIndex([]); // S-002 absent
      const graph = new RelationshipGraph(reg, index);
      const src = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });

      // No path for S-002 ⇒ addInverseReference returns early, no write attempted.
      await expect(graph.syncBidirectional(src, null, fs, resolver)).resolves.toBeUndefined();
      expect(fs.allPaths()).toEqual([]);
    });

    it('appends to a scalar inverse, promoting it to an array', async () => {
      const fs = new InMemoryFileSystem({
        '/vault/entities/stories/S-002_b.md': rawEntity('S-002', 'story', { blocks: 'S-009' }),
      });
      const index = new InMemoryIndex([
        { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
      ]);
      const graph = new RelationshipGraph(reg, index);
      const src = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });

      await graph.syncBidirectional(src, null, fs, resolver);
      const target = await fs.readFile('/vault/entities/stories/S-002_b.md');
      expect(target).toContain('S-009');
      expect(target).toContain('S-001');
    });

    it('is idempotent when the inverse array already contains the source', async () => {
      const before = rawEntity('S-002', 'story', { blocks: ['S-001'] });
      const fs = new InMemoryFileSystem({ '/vault/entities/stories/S-002_b.md': before });
      const index = new InMemoryIndex([
        { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
      ]);
      const graph = new RelationshipGraph(reg, index);
      const src = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });

      await graph.syncBidirectional(src, null, fs, resolver);
      // Already present ⇒ file content unchanged.
      expect(await fs.readFile('/vault/entities/stories/S-002_b.md')).toBe(before);
    });

    it('is idempotent when the inverse scalar already equals the source', async () => {
      const before = rawEntity('S-002', 'story', { blocks: 'S-001' });
      const fs = new InMemoryFileSystem({ '/vault/entities/stories/S-002_b.md': before });
      const index = new InMemoryIndex([
        { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
      ]);
      const graph = new RelationshipGraph(reg, index);
      const src = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });

      await graph.syncBidirectional(src, null, fs, resolver);
      expect(await fs.readFile('/vault/entities/stories/S-002_b.md')).toBe(before);
    });
  });

  describe('removeInverseReference variants (via syncBidirectional removal)', () => {
    function setup(targetInverse: string | string[]) {
      const fs = new InMemoryFileSystem({
        '/vault/entities/stories/S-002_b.md': rawEntity('S-002', 'story', { blocks: targetInverse }),
      });
      const index = new InMemoryIndex([
        { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
      ]);
      const graph = new RelationshipGraph(reg, index);
      const previous = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });
      const current = makeEntity('story', 'S-001', { relationships: {} });
      return { fs, graph, previous, current };
    }

    it('deletes the field when removing the only array element', async () => {
      const { fs, graph, previous, current } = setup(['S-001']);
      await graph.syncBidirectional(current, previous, fs, resolver);
      expect(await fs.readFile('/vault/entities/stories/S-002_b.md')).not.toContain('blocks');
    });

    it('collapses to a scalar when one element remains', async () => {
      const { fs, graph, previous, current } = setup(['S-001', 'S-007']);
      await graph.syncBidirectional(current, previous, fs, resolver);
      const target = await fs.readFile('/vault/entities/stories/S-002_b.md');
      expect(target).toContain('blocks: S-007');
      expect(target).not.toContain('S-001');
    });

    it('keeps an array when more than one element remains', async () => {
      const { fs, graph, previous, current } = setup(['S-001', 'S-007', 'S-008']);
      await graph.syncBidirectional(current, previous, fs, resolver);
      const target = await fs.readFile('/vault/entities/stories/S-002_b.md');
      expect(target).toContain('S-007');
      expect(target).toContain('S-008');
      expect(target).not.toContain('S-001');
    });

    it('deletes a scalar inverse that matches the source', async () => {
      const { fs, graph, previous, current } = setup('S-001');
      await graph.syncBidirectional(current, previous, fs, resolver);
      expect(await fs.readFile('/vault/entities/stories/S-002_b.md')).not.toContain('S-001');
    });

    it('leaves the file alone when the inverse field is absent', async () => {
      const before = rawEntity('S-002', 'story'); // no blocks field
      const fs = new InMemoryFileSystem({ '/vault/entities/stories/S-002_b.md': before });
      const index = new InMemoryIndex([{ id: 'S-002', path: '/vault/entities/stories/S-002_b.md' }]);
      const graph = new RelationshipGraph(reg, index);
      const previous = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });
      const current = makeEntity('story', 'S-001', { relationships: {} });

      await graph.syncBidirectional(current, previous, fs, resolver);
      expect(await fs.readFile('/vault/entities/stories/S-002_b.md')).toBe(before);
    });
  });

  describe('wouldCreateCycle', () => {
    it('returns hasCycle=false when no path connects the nodes', () => {
      const index = new InMemoryIndex([
        { id: 'S-001', path: '/p/S-001.md' },
        { id: 'S-002', path: '/p/S-002.md' },
      ]);
      const graph = new RelationshipGraph(reg, index);
      const result = graph.wouldCreateCycle('dependency', 'S-001', 'S-002');
      expect(result.hasCycle).toBe(false);
      expect(result.cyclePath).toBeUndefined();
    });
  });

  describe('applyTransitiveReduction guards', () => {
    it('returns [] for an unknown relationship name', async () => {
      const graph = new RelationshipGraph(reg, new InMemoryIndex([]));
      const a = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });
      expect(await graph.applyTransitiveReduction(a, 'no-such-rel')).toEqual([]);
    });

    it('returns [] when the entity type has no matching pair', async () => {
      const graph = new RelationshipGraph(reg, new InMemoryIndex([]));
      // dependency pairs are milestone/story/task — a feature has no forward pair.
      const feat = makeEntity('feature', 'F-001', { relationships: {} });
      expect(await graph.applyTransitiveReduction(feat, 'dependency')).toEqual([]);
    });

    it('returns direct targets unchanged when there is at most one', async () => {
      const graph = new RelationshipGraph(reg, new InMemoryIndex([]));
      const a = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });
      expect(await graph.applyTransitiveReduction(a, 'dependency')).toEqual(['S-002']);
    });
  });
});
