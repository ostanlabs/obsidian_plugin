/**
 * Contract suite G — CanvasManager. (TDD plan §4.2.G)
 *
 *   - schema-driven node dimensions/colors per type.
 *   - layout invariants (no overlaps, parent-before-child column ordering) in the
 *     positioningV4 invariant/tolerance style.
 *
 * RED now: CanvasManager methods throw NOT_IMPLEMENTED.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry, PathResolver, CanvasManager, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import type { CanvasNode } from '../../src/entity-core/canvas.js';
import type { PathResolverConfig } from '../../src/entity-core/path-resolver.js';
import { InMemoryFileSystem } from './harness/in-memory-fs.js';

const CONFIG: PathResolverConfig = {
  vaultPath: '/vault',
  entitiesFolder: 'entities',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

const overlaps = (a: CanvasNode, b: CanvasNode): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('G. CanvasManager', () => {
  let manager: CanvasManager;
  beforeEach(() => {
    const reg = new SchemaRegistry(DEFAULT_SCHEMA);
    manager = new CanvasManager(reg, new InMemoryFileSystem(), new PathResolver(reg, CONFIG));
  });

  it('uses schema-driven dimensions and color for a milestone node', () => {
    const node = manager.createNode('M-001', 'entities/milestones/M-001_x.md', { x: 0, y: 0 });
    expect(node.width).toBe(500); // DEFAULT_SCHEMA milestone.canvas.width
    expect(node.height).toBe(400);
    expect(node.color).toBe('6');
    expect(node.file).toBe('entities/milestones/M-001_x.md');
  });

  it('uses different dimensions for a feature node', () => {
    const node = manager.createNode('F-001', 'entities/features/F-001_x.md', { x: 0, y: 0 });
    expect(node.width).toBe(300);
    expect(node.height).toBe(220);
    expect(node.color).toBe('1');
  });

  it('styles an edge from its relationship definition', () => {
    const edge = manager.createEdge('n1', 'n2', 'dependency');
    expect(edge.color).toBe('blue');
  });

  it('throws when the entity path does not encode a known type', () => {
    expect(() => manager.createNode('X-001', 'notes/loose/X-001.md', { x: 0, y: 0 })).toThrow(
      /Unable to determine entity type/
    );
  });

  it('getTypeFromPath resolves a folder to its type and null otherwise', () => {
    expect(manager.getTypeFromPath('entities/milestones/M-001_x.md')).toBe('milestone');
    expect(manager.getTypeFromPath('entities/unknownfolder/Z-001.md')).toBeNull();
    expect(manager.getTypeFromPath('no/entities/segment.md')).toBeNull();
  });

  // addNode resolves the entity's folder from its ID PREFIX ('M') via the
  // schema-driven getEntityTypeFromId helper, so it works against the stock
  // DEFAULT_SCHEMA (keyed by type NAME 'milestone') with no clone/rename workaround.
  it('addNode appends a schema-styled node and persists the canvas', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/projects/main.canvas': JSON.stringify({ nodes: [], edges: [] }),
    });
    const reg = new SchemaRegistry(DEFAULT_SCHEMA);
    const mgr = new CanvasManager(reg, fs, new PathResolver(reg, CONFIG));

    await mgr.addNode('projects/main.canvas', 'M-001');

    const canvas = JSON.parse(await fs.readFile('/vault/projects/main.canvas')) as {
      nodes: CanvasNode[];
    };
    expect(canvas.nodes).toHaveLength(1);
    expect(canvas.nodes[0].file).toBe('entities/milestones/M-001.md');
    expect(canvas.nodes[0].width).toBe(500);
    // First node on an empty canvas lands at the origin (calculateNextPosition empty branch).
    expect(canvas.nodes[0].x).toBe(0);
    expect(canvas.nodes[0].y).toBe(0);
  });

  it('addNode offsets a new node past the last one when no position is given', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/projects/main.canvas': JSON.stringify({
        nodes: [{ id: 'n1', type: 'file', file: 'entities/milestones/M-001.md', x: 100, y: 40, width: 500, height: 400 }],
        edges: [],
      }),
    });
    const reg = new SchemaRegistry(DEFAULT_SCHEMA);
    const mgr = new CanvasManager(reg, fs, new PathResolver(reg, CONFIG));

    await mgr.addNode('projects/main.canvas', 'M-002');

    const canvas = JSON.parse(await fs.readFile('/vault/projects/main.canvas')) as {
      nodes: CanvasNode[];
    };
    expect(canvas.nodes).toHaveLength(2);
    // calculateNextPosition: lastNode.x + lastNode.width + 50 = 100 + 500 + 50.
    expect(canvas.nodes[1].x).toBe(650);
    expect(canvas.nodes[1].y).toBe(40);
  });

  it('addNode honours an explicit position', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/projects/main.canvas': JSON.stringify({ nodes: [], edges: [] }),
    });
    const reg = new SchemaRegistry(DEFAULT_SCHEMA);
    const mgr = new CanvasManager(reg, fs, new PathResolver(reg, CONFIG));

    await mgr.addNode('projects/main.canvas', 'M-003', { x: 12, y: 34 });

    const canvas = JSON.parse(await fs.readFile('/vault/projects/main.canvas')) as {
      nodes: CanvasNode[];
    };
    expect(canvas.nodes[0].x).toBe(12);
    expect(canvas.nodes[0].y).toBe(34);
  });

  it('createEdge falls back to a default style for an unknown relationship', () => {
    const edge = manager.createEdge('n1', 'n2', 'no-such-relationship');
    expect(edge.color).toBe('gray');
    expect(edge.fromSide).toBe('right');
    expect(edge.toSide).toBe('left');
  });

  it('auto-layout produces no overlapping nodes (invariant)', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/projects/main.canvas': JSON.stringify({
        nodes: [
          { id: 'n1', type: 'file', file: 'entities/milestones/M-001_x.md', x: 0, y: 0, width: 500, height: 400 },
          { id: 'n2', type: 'file', file: 'entities/stories/S-001_x.md', x: 10, y: 10, width: 400, height: 300 },
        ],
        edges: [],
      }),
    });
    const reg = new SchemaRegistry(DEFAULT_SCHEMA);
    const mgr = new CanvasManager(reg, fs, new PathResolver(reg, CONFIG));

    const result = await mgr.autoLayout('projects/main.canvas');
    expect(result.success).toBe(true);

    const canvas = JSON.parse(await fs.readFile('/vault/projects/main.canvas')) as {
      nodes: CanvasNode[];
    };
    for (let i = 0; i < canvas.nodes.length; i++) {
      for (let j = i + 1; j < canvas.nodes.length; j++) {
        expect(overlaps(canvas.nodes[i], canvas.nodes[j])).toBe(false);
      }
    }
  });
});
