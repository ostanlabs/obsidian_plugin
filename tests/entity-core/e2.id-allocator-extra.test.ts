/**
 * Contract suite E2 — IDAllocator coverage backfill (Phase 2a hardening).
 *
 * Pins allocator edge cases suite E leaves uncovered: unknown-type rejection,
 * reserve() delegation, gap non-filling, malformed-id tolerance, prefix
 * isolation, padding overflow, validate() edge shapes, repairDuplicates'
 * no-duplicate / unknown-prefix / read-error / archived-ordering paths, and
 * the (pinned) fact that allocate() ignores reservations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SchemaRegistry,
  IDAllocator,
  PathResolver,
  getEntityTypeFromId,
  DEFAULT_SCHEMA,
} from '../../src/entity-core/index.js';
import type { PathResolverConfig } from '../../src/entity-core/path-resolver.js';
import { InMemoryIndex } from './harness/in-memory-index.js';
import { InMemoryFileSystem } from './harness/in-memory-fs.js';

const CONFIG: PathResolverConfig = {
  vaultPath: '/vault',
  entitiesFolder: 'entities',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

describe('E2. IDAllocator — allocate edge cases', () => {
  let reg: SchemaRegistry;
  beforeEach(() => {
    reg = new SchemaRegistry(DEFAULT_SCHEMA);
  });

  it('throws for an unknown entity type', async () => {
    const allocator = new IDAllocator(reg, new InMemoryIndex([]));
    await expect(allocator.allocate('epic')).rejects.toThrow(/Unknown entity type: epic/);
  });

  it('does NOT fill gaps — always max+1', async () => {
    const index = new InMemoryIndex([
      { id: 'T-001', path: '/vault/entities/tasks/T-001.md' },
      { id: 'T-050', path: '/vault/entities/tasks/T-050.md' },
    ]);
    const allocator = new IDAllocator(reg, index);
    expect(await allocator.allocate('task')).toBe('T-051'); // not T-002
  });

  it('ignores ids of other types and malformed numeric parts', async () => {
    const index = new InMemoryIndex([
      { id: 'S-099', path: '/vault/entities/stories/S-099.md' }, // other prefix
      { id: 'T-abc', path: '/vault/entities/tasks/T-abc.md' }, // NaN part → skipped
      { id: 'T-003', path: '/vault/entities/tasks/T-003.md' },
    ]);
    const allocator = new IDAllocator(reg, index);
    expect(await allocator.allocate('task')).toBe('T-004');
  });

  it('parses the numeric part leniently (parseInt prefix semantics)', async () => {
    // BUG?: "T-007x" is not a valid id, but parseInt("007x") === 7, so it
    // participates in the max computation instead of being skipped like "T-abc".
    const index = new InMemoryIndex([
      { id: 'T-007x', path: '/vault/entities/tasks/T-007x.md' },
    ]);
    const allocator = new IDAllocator(reg, index);
    expect(await allocator.allocate('task')).toBe('T-008');
  });

  it('does not confuse the DEC and DOC prefixes', async () => {
    const index = new InMemoryIndex([
      { id: 'DEC-010', path: '/vault/entities/decisions/DEC-010.md' },
      { id: 'DOC-020', path: '/vault/entities/documents/DOC-020.md' },
    ]);
    const allocator = new IDAllocator(reg, index);
    expect(await allocator.allocate('decision')).toBe('DEC-011');
    expect(await allocator.allocate('document')).toBe('DOC-021');
  });

  it('grows past the padding width without truncation', async () => {
    const index = new InMemoryIndex([
      { id: 'T-1000', path: '/vault/entities/tasks/T-1000.md' },
    ]);
    const allocator = new IDAllocator(reg, index);
    expect(await allocator.allocate('task')).toBe('T-1001');
  });

  it('sequential allocations without indexing return the SAME id (allocate is pure)', async () => {
    const index = new InMemoryIndex([{ id: 'T-001', path: '/vault/entities/tasks/T-001.md' }]);
    const allocator = new IDAllocator(reg, index);
    const a = await allocator.allocate('task');
    const b = await allocator.allocate('task');
    expect(a).toBe('T-002');
    expect(b).toBe('T-002'); // caller must index/register before allocating again
  });

  it('reserve() delegates to the index reservation set', () => {
    const index = new InMemoryIndex([]);
    const allocator = new IDAllocator(reg, index);
    expect(index.isReserved('T-500')).toBe(false);
    allocator.reserve('T-500');
    expect(index.isReserved('T-500')).toBe(true);
  });

  it('allocate() ignores reservations made via reserve()', async () => {
    // BUG?: reserve() records the id, but allocate() only scans getAllIds(),
    // so a reserved-but-unindexed id is handed out again.
    const index = new InMemoryIndex([]);
    const allocator = new IDAllocator(reg, index);
    allocator.reserve('T-001');
    expect(await allocator.allocate('task')).toBe('T-001');
  });
});

describe('E2. IDAllocator — validate edge shapes', () => {
  const reg = new SchemaRegistry(DEFAULT_SCHEMA);
  const allocator = new IDAllocator(reg, new InMemoryIndex([]));

  it('accepts digits longer than the padding', () => {
    expect(allocator.validate('M-0001')).toBe(true);
    expect(allocator.validate('T-12345')).toBe(true);
  });

  it('rejects ids with a non-numeric suffix', () => {
    expect(allocator.validate('M-abc')).toBe(false);
    expect(allocator.validate('M-00a1')).toBe(false);
  });

  it('rejects ids without a PREFIX- shape', () => {
    expect(allocator.validate('M001')).toBe(false);
    expect(allocator.validate('m-001')).toBe(false); // lowercase prefix
    expect(allocator.validate('')).toBe(false);
    expect(allocator.validate('001')).toBe(false);
  });
});

describe('E2. getEntityTypeFromId — malformed ids', () => {
  const reg = new SchemaRegistry(DEFAULT_SCHEMA);

  it('returns null when the id has no uppercase PREFIX- shape', () => {
    expect(getEntityTypeFromId('nonsense', reg)).toBeNull();
    expect(getEntityTypeFromId('t-001', reg)).toBeNull();
    expect(getEntityTypeFromId('', reg)).toBeNull();
    expect(getEntityTypeFromId('123-456', reg)).toBeNull();
  });
});

describe('E2. IDAllocator — repairDuplicates edge cases', () => {
  let reg: SchemaRegistry;
  let resolver: PathResolver;
  beforeEach(() => {
    reg = new SchemaRegistry(DEFAULT_SCHEMA);
    resolver = new PathResolver(reg, CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns [] and touches nothing when there are no duplicates', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/entities/tasks/T-001.md': '---\nid: T-001\n---\n',
    });
    const index = new InMemoryIndex([{ id: 'T-001', path: '/vault/entities/tasks/T-001.md' }]);
    const allocator = new IDAllocator(reg, index);
    const before = new Map(fs.allFiles());

    expect(await allocator.repairDuplicates(fs, resolver)).toEqual([]);
    expect(fs.allFiles()).toEqual(before);
  });

  it('skips duplicates whose id prefix is not in the schema', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/entities/misc/Z-001_a.md': '---\nid: Z-001\n---\nA\n',
      '/vault/entities/misc/Z-001_b.md': '---\nid: Z-001\n---\nB\n',
    });
    const index = new InMemoryIndex([
      { id: 'Z-001', path: '/vault/entities/misc/Z-001_a.md' },
      { id: 'Z-001', path: '/vault/entities/misc/Z-001_b.md' },
    ]);
    const allocator = new IDAllocator(reg, index);

    expect(await allocator.repairDuplicates(fs, resolver)).toEqual([]);
    // Both files keep the unknown id untouched.
    expect(await fs.readFile('/vault/entities/misc/Z-001_b.md')).toContain('id: Z-001');
  });

  it('logs and continues when a duplicate file cannot be read', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fs = new InMemoryFileSystem({}); // paths in index do not exist on disk
    const index = new InMemoryIndex([
      { id: 'T-010', path: '/vault/entities/tasks/T-010_a.md' },
      { id: 'T-010', path: '/vault/entities/tasks/T-010_b.md' },
    ]);
    const allocator = new IDAllocator(reg, index);

    expect(await allocator.repairDuplicates(fs, resolver)).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to repair duplicate T-010'),
      expect.anything()
    );
  });

  it('keeps the first path when ALL duplicates are archived', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/archive/tasks/T-050_first.md': '---\nid: T-050\ntitle: First\n---\n',
      '/vault/archive/tasks/T-050_second.md': '---\nid: T-050\ntitle: Second\n---\n',
    });
    const index = new InMemoryIndex([
      { id: 'T-050', path: '/vault/archive/tasks/T-050_first.md', archived: true },
      { id: 'T-050', path: '/vault/archive/tasks/T-050_second.md', archived: true },
    ]);
    const allocator = new IDAllocator(reg, index);

    const reassigned = await allocator.repairDuplicates(fs, resolver);
    expect(reassigned).toEqual(['T-051']); // max over both T-050 entries + 1
    expect(await fs.readFile('/vault/archive/tasks/T-050_first.md')).toContain('id: T-050');
    expect(await fs.readFile('/vault/archive/tasks/T-050_second.md')).toContain('id: T-051');
  });

  it('keeps the active file even when the archived duplicate is listed first', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/archive/tasks/T-060_old.md': '---\nid: T-060\ntitle: Archived\n---\n',
      '/vault/entities/tasks/T-060_live.md': '---\nid: T-060\ntitle: Active\n---\n',
    });
    const index = new InMemoryIndex([
      { id: 'T-060', path: '/vault/archive/tasks/T-060_old.md', archived: true },
      { id: 'T-060', path: '/vault/entities/tasks/T-060_live.md' },
    ]);
    const allocator = new IDAllocator(reg, index);

    const reassigned = await allocator.repairDuplicates(fs, resolver);
    expect(reassigned).toHaveLength(1);
    // The active file keeps T-060; the archived one is rewritten.
    expect(await fs.readFile('/vault/entities/tasks/T-060_live.md')).toContain('id: T-060');
    expect(await fs.readFile('/vault/archive/tasks/T-060_old.md')).toContain(`id: ${reassigned[0]}`);
  });
});
