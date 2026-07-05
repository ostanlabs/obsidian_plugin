/**
 * Contract suite D — RelationshipGraph. (TDD plan §4.2.D)
 *
 * Fails the spec's §9 stubs + additive-only sync by design:
 *   - forward→inverse sync for the 7 pairs, both directions
 *     (depends_on→blocks NOT enables; affects→decided_by; documents→documented_by).
 *   - inverse REMOVAL on unlink (parity F8).
 *   - cycle-closing write is REJECTED (not silently mutated).
 *   - transitive reduction removes A→C when A→B→C.
 *
 * RED now: every RelationshipGraph method throws NOT_IMPLEMENTED. Assertions read
 * raw target-file content so they don't depend on the (also-stubbed) parser.
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

describe('D. RelationshipGraph', () => {
  let reg: SchemaRegistry;
  let resolver: PathResolver;
  beforeEach(() => {
    reg = new SchemaRegistry(DEFAULT_SCHEMA);
    resolver = new PathResolver(reg, CONFIG);
  });

  it('syncs depends_on → blocks on the target (NOT enables)', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/entities/stories/S-001_a.md': rawEntity('S-001', 'story', { depends_on: ['S-002'] }),
      '/vault/entities/stories/S-002_b.md': rawEntity('S-002', 'story'),
    });
    const index = new InMemoryIndex([
      { id: 'S-001', path: '/vault/entities/stories/S-001_a.md' },
      { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
    ]);
    const graph = new RelationshipGraph(reg, index);
    const source = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });

    await graph.syncBidirectional(source, null, fs, resolver);

    const target = await fs.readFile('/vault/entities/stories/S-002_b.md');
    expect(target).toMatch(/blocks:/);
    expect(target).toContain('S-001');
    expect(target).not.toContain('enables');
  });

  it('syncs affects → decided_by on the target', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/entities/decisions/DEC-001_x.md': rawEntity('DEC-001', 'decision', { affects: ['F-001'] }),
      '/vault/entities/features/F-001_y.md': rawEntity('F-001', 'feature'),
    });
    const index = new InMemoryIndex([
      { id: 'DEC-001', path: '/vault/entities/decisions/DEC-001_x.md' },
      { id: 'F-001', path: '/vault/entities/features/F-001_y.md' },
    ]);
    const graph = new RelationshipGraph(reg, index);
    const dec = makeEntity('decision', 'DEC-001', {
      status: 'Decided',
      relationships: { affects: ['F-001'] },
    });

    await graph.syncBidirectional(dec, null, fs, resolver);

    const target = await fs.readFile('/vault/entities/features/F-001_y.md');
    expect(target).toMatch(/decided_by:/);
    expect(target).toContain('DEC-001');
  });

  it('syncs documents → documented_by on the target', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/entities/documents/DOC-001_s.md': rawEntity('DOC-001', 'document', { documents: ['F-001'] }),
      '/vault/entities/features/F-001_y.md': rawEntity('F-001', 'feature'),
    });
    const index = new InMemoryIndex([
      { id: 'DOC-001', path: '/vault/entities/documents/DOC-001_s.md' },
      { id: 'F-001', path: '/vault/entities/features/F-001_y.md' },
    ]);
    const graph = new RelationshipGraph(reg, index);
    const doc = makeEntity('document', 'DOC-001', {
      status: 'Approved',
      relationships: { documents: ['F-001'] },
    });

    await graph.syncBidirectional(doc, null, fs, resolver);
    expect(await fs.readFile('/vault/entities/features/F-001_y.md')).toMatch(/documented_by:/);
  });

  it('REMOVES the stale inverse when a relationship is cleared (parity F8)', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/entities/stories/S-001_a.md': rawEntity('S-001', 'story'),
      '/vault/entities/stories/S-002_b.md': rawEntity('S-002', 'story', { blocks: ['S-001'] }),
    });
    const index = new InMemoryIndex([
      { id: 'S-001', path: '/vault/entities/stories/S-001_a.md' },
      { id: 'S-002', path: '/vault/entities/stories/S-002_b.md' },
    ]);
    const graph = new RelationshipGraph(reg, index);
    const previous = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002'] } });
    const current = makeEntity('story', 'S-001', { relationships: {} }); // dependency removed

    await graph.syncBidirectional(current, previous, fs, resolver);

    const target = await fs.readFile('/vault/entities/stories/S-002_b.md');
    expect(target).not.toContain('S-001'); // stale blocks inverse must be gone
  });

  it('REJECTS a write that would close a dependency cycle', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/entities/stories/S-001_a.md': rawEntity('S-001', 'story'),
      '/vault/entities/stories/S-002_b.md': rawEntity('S-002', 'story', { depends_on: ['S-001'] }),
    });
    const index = new InMemoryIndex([
      {
        id: 'S-002',
        path: '/vault/entities/stories/S-002_b.md',
        relationships: { depends_on: ['S-001'] },
        forwardFields: { dependency: 'depends_on' },
      },
      { id: 'S-001', path: '/vault/entities/stories/S-001_a.md' },
    ]);
    const graph = new RelationshipGraph(reg, index);

    // S-002 → S-001 already; adding S-001 → S-002 closes a cycle ⇒ reject.
    await expect(graph.link('S-001', 'depends_on', 'S-002', fs, resolver)).rejects.toThrow(/cycle/i);
  });

  it('detects an existing dependency cycle', () => {
    const index = new InMemoryIndex([
      {
        id: 'S-001',
        path: '/p/S-001.md',
        relationships: { depends_on: ['S-002'] },
        forwardFields: { dependency: 'depends_on' },
      },
      {
        id: 'S-002',
        path: '/p/S-002.md',
        relationships: { depends_on: ['S-001'] },
        forwardFields: { dependency: 'depends_on' },
      },
    ]);
    const graph = new RelationshipGraph(reg, index);
    expect(graph.detectCycles('dependency').length).toBeGreaterThan(0);
  });

  it('applies transitive reduction: drops A→C when A→B→C', async () => {
    const index = new InMemoryIndex([
      {
        id: 'S-002',
        path: '/p/S-002.md',
        relationships: { depends_on: ['S-003'] },
        forwardFields: { dependency: 'depends_on' },
      },
      { id: 'S-003', path: '/p/S-003.md' },
    ]);
    const graph = new RelationshipGraph(reg, index);
    const a = makeEntity('story', 'S-001', { relationships: { depends_on: ['S-002', 'S-003'] } });

    const reduced = await graph.applyTransitiveReduction(a, 'dependency');
    expect(reduced).toEqual(['S-002']); // S-003 is reachable via S-002
  });
});
