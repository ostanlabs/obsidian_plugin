/**
 * Contract suite A3 — SchemaRegistry defaults & fallback branches (Phase 2a).
 *
 * Pins the DEFAULT_SCHEMA workstream defaults the convergence spec depends on
 * (getDefaultWorkstream → 'engineering'), the filenameCase 'snake' fallback,
 * the sparse object-format workstream fallbacks (missing values/default/
 * normalization/canvas), the empty array-format fallback, and load() with a
 * non-Error rejection.
 */

import { describe, it, expect } from 'vitest';
import { SchemaRegistry, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import type { FileSystem, Schema } from '../../src/entity-core/types.js';

/** Minimal valid schema skeleton for branch probing. */
function bareSchema(overrides: Partial<Schema> = {}): Schema {
  return {
    schemaVersion: 1,
    settings: { idPadding: 3, archiveLayout: 'by-type', filenamePattern: '{id}' },
    entityTypes: [],
    relationships: [],
    ...overrides,
  } as Schema;
}

describe('A3. DEFAULT_SCHEMA workstream defaults (convergence spec §5.3)', () => {
  const reg = new SchemaRegistry(DEFAULT_SCHEMA);

  it("getDefaultWorkstream() is 'engineering'", () => {
    expect(reg.getDefaultWorkstream()).toBe('engineering');
  });

  it('exposes the six default workstreams', () => {
    expect(reg.getWorkstreams()).toEqual([
      'engineering',
      'business',
      'infra',
      'research',
      'design',
      'marketing',
    ]);
  });

  it("DEFAULT_SCHEMA filenameCase is 'preserve' (title-only filenames keep casing)", () => {
    expect(reg.getFilenameCase()).toBe('preserve');
  });
});

describe('A3. getFilenameCase fallback', () => {
  it("defaults to 'snake' when the schema omits filenameCase", () => {
    const reg = new SchemaRegistry(bareSchema());
    expect(reg.getFilenameCase()).toBe('snake');
  });
});

describe('A3. workstreams — sparse object format fallbacks', () => {
  // Object format with every optional sub-key missing.
  const sparse = new SchemaRegistry(
    bareSchema({ workstreams: {} as Schema['workstreams'] })
  );

  it('getWorkstreams falls back to [] when values is missing', () => {
    expect(sparse.getWorkstreams()).toEqual([]);
  });

  it("getDefaultWorkstream falls back to '' when default is missing", () => {
    expect(sparse.getDefaultWorkstream()).toBe('');
  });

  it('normalizeWorkstream passes through when values and normalization are missing', () => {
    expect(sparse.normalizeWorkstream('dev')).toBe('dev');
    expect(sparse.normalizeWorkstream('  ANYTHING  ')).toBe('  ANYTHING  ');
  });

  it('getWorkstreamColor falls back to gray when canvas is missing', () => {
    expect(sparse.getWorkstreamColor('engineering')).toBe('#808080');
  });
});

describe('A3. workstreams — empty array format', () => {
  const empty = new SchemaRegistry(
    bareSchema({ workstreams: [] as unknown as Schema['workstreams'] })
  );

  it("getDefaultWorkstream falls back to '' for an empty array", () => {
    expect(empty.getWorkstreams()).toEqual([]);
    expect(empty.getDefaultWorkstream()).toBe('');
  });
});

describe('A3. SchemaRegistry.load — non-Error rejection', () => {
  it('stringifies a non-Error rejection into errors[] and uses the default', async () => {
    const fakeFs = {
      readFile: () => Promise.reject('EPERM string rejection'),
    } as unknown as FileSystem;

    const result = await SchemaRegistry.load(fakeFs, '/vault');
    expect(result.usedDefault).toBe(true);
    expect(result.errors).toEqual(['Failed to load schema: EPERM string rejection']);
    expect(result.registry.getSchema()).toBe(DEFAULT_SCHEMA);
  });
});

describe('A3. getCardinalityForField — shared-field overwrite pins', () => {
  // NOTE: schema-registry.ts:190 ("Field X not found in relationship Y pairs")
  // is unreachable by construction: fieldToRelationship entries are only ever
  // set from a relationship's own pair fields, and a later overwrite points to
  // a relationship that also contains the field. Pin the overwrite semantics.
  it('a field claimed by two relationships resolves to the LAST one registered', () => {
    const schema = bareSchema({
      relationships: [
        {
          name: 'first',
          label: 'First',
          pairs: [{ from: 'a', to: 'b', forward: 'shared', reverse: 'rev_first' }],
          cardinality: { forward: 'one', reverse: 'many' },
          canvas: { color: 'gray', style: 'solid' },
          graph: { transitiveReduction: false, cyclePrevention: false },
        },
        {
          name: 'second',
          label: 'Second',
          pairs: [{ from: 'c', to: 'd', forward: 'shared', reverse: 'rev_second' }],
          cardinality: { forward: 'many', reverse: 'one' },
          canvas: { color: 'gray', style: 'solid' },
          graph: { transitiveReduction: false, cyclePrevention: false },
        },
      ] as Schema['relationships'],
    });
    const reg = new SchemaRegistry(schema);
    expect(reg.getRelationshipForField('shared')?.name).toBe('second');
    expect(reg.getCardinalityForField('shared')).toBe('many'); // second's forward
    // Each unshared reverse field still resolves to its own relationship.
    expect(reg.getCardinalityForField('rev_first')).toBe('many');
    expect(reg.getCardinalityForField('rev_second')).toBe('one');
  });
});
