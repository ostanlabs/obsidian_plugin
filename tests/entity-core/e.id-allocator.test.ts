/**
 * Contract suite E — IDAllocator. (TDD plan §4.2.E)
 *
 *   - per-type max+1 INCLUDING archived entities (seed archived T-900 → next ≠ T-900).
 *   - duplicate detection + collision repair (S-035 active + archived → repair).
 *   - padding ≥ 3; F- feature prefix; schema-driven getEntityTypeFromId.
 *
 * RED now: allocate()/repairDuplicates()/getEntityTypeFromId() throw NOT_IMPLEMENTED.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SchemaRegistry,
  IDAllocator,
  PathResolver,
  getEntityTypeFromId,
  DEFAULT_SCHEMA,
} from '../../src/entity-core/index.js';
import type { PathResolverConfig } from '../../src/entity-core/path-resolver.js';
import { InMemoryIndex } from './harness/in-memory-index.js';
import { loadFixtureFs, loadFixtureIndex } from './harness/fixture-vault.js';

const CONFIG: PathResolverConfig = {
  vaultPath: '/vault',
  entitiesFolder: 'entities',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

describe('E. IDAllocator', () => {
  let reg: SchemaRegistry;
  beforeEach(() => {
    reg = new SchemaRegistry(DEFAULT_SCHEMA);
  });

  it('allocates per-type max+1 INCLUDING archived ids (parity #6)', async () => {
    const index = new InMemoryIndex([
      { id: 'T-001', path: '/vault/entities/tasks/T-001.md' },
      { id: 'T-005', path: '/vault/entities/tasks/T-005.md' },
      { id: 'T-900', path: '/vault/archive/tasks/T-900.md', archived: true },
    ]);
    const allocator = new IDAllocator(reg, index);
    const next = await allocator.allocate('task');
    expect(next).toBe('T-901'); // must clear the archived T-900, not reissue it
    expect(next).not.toBe('T-900');
  });

  it('pads the counter to at least 3 digits', async () => {
    const index = new InMemoryIndex([]);
    const allocator = new IDAllocator(reg, index);
    expect(await allocator.allocate('milestone')).toBe('M-001');
  });

  it('uses the F- prefix for features', async () => {
    const index = new InMemoryIndex([{ id: 'F-007', path: '/vault/entities/features/F-007.md' }]);
    const allocator = new IDAllocator(reg, index);
    expect(await allocator.allocate('feature')).toBe('F-008');
  });

  it('uses the DEC- prefix for decisions', async () => {
    const index = new InMemoryIndex([{ id: 'DEC-012', path: '/vault/entities/decisions/DEC-012.md' }]);
    const allocator = new IDAllocator(reg, index);
    expect(await allocator.allocate('decision')).toBe('DEC-013');
  });

  it('repairs the S-035 duplicate: keeps active S-035, reassigns the archived one', async () => {
    const fs = loadFixtureFs();
    const index = loadFixtureIndex();
    const allocator = new IDAllocator(reg, index);
    const resolver = new PathResolver(reg, CONFIG);

    const reassigned = await allocator.repairDuplicates(fs, resolver);
    expect(reassigned.length).toBeGreaterThan(0);

    // After repair, exactly one file should still declare id S-035 (the active one).
    const withS035 = [...fs.allFiles().values()].filter((c) => /^id:\s*S-035\s*$/m.test(c));
    expect(withS035).toHaveLength(1);
    expect(withS035[0]).toContain('Active S-035');
  });

  it('validates id format against the schema', () => {
    const allocator = new IDAllocator(reg, new InMemoryIndex([]));
    expect(allocator.validate('M-001')).toBe(true);
    expect(allocator.validate('M-1')).toBe(false); // under-padded
    expect(allocator.validate('X-001')).toBe(false); // unknown prefix
  });

  it('resolves entity type from id via the schema (not hardcoded prefixes)', () => {
    expect(getEntityTypeFromId('DEC-001', reg)).toBe('decision');
    expect(getEntityTypeFromId('DOC-001', reg)).toBe('document');
    expect(getEntityTypeFromId('F-001', reg)).toBe('feature');
    expect(getEntityTypeFromId('Z-001', reg)).toBeNull();
  });
});
