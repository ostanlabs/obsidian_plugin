/**
 * Contract suite A2 — SchemaRegistry coverage backfill.
 *
 * Covers the accessors, error branches, workstream variants (array + object
 * format), canvas config fallback, and the SchemaRegistry.load() precedence
 * (missing / valid / invalid schema.json) not exercised by suite A.
 */

import { describe, it, expect } from 'vitest';
import { SchemaRegistry, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import type { Schema } from '../../src/entity-core/types.js';
import { InMemoryFileSystem } from './harness/in-memory-fs.js';

/** Minimal but valid custom schema (object-format workstreams). */
const CUSTOM_SCHEMA: Schema = {
  schemaVersion: 7,
  settings: { idPadding: 4, archiveLayout: 'quarterly', filenamePattern: '{id}' },
  entityTypes: [
    {
      type: 'widget',
      label: 'Widget',
      idPrefix: 'W',
      folder: 'widgets',
      statuses: ['New', 'Done'],
      defaultStatus: 'New',
      fields: [{ name: 'size', kind: 'number', required: true }],
      canvas: { width: 500, height: 200, color: '2', icon: 'box' },
    },
  ],
  relationships: [
    {
      name: 'linkage',
      label: 'Linkage',
      pairs: [{ from: 'widget', to: 'widget', forward: 'links_to', reverse: 'linked_from' }],
      cardinality: { forward: 'many', reverse: 'many' },
      canvas: { color: 'gray', style: 'solid' },
      graph: { transitiveReduction: false, cyclePrevention: false },
    },
  ],
  workstreams: {
    values: ['engineering', 'design'],
    default: 'engineering',
    normalization: { dev: 'engineering', ux: 'design' },
    canvas: { engineering: { color: '3' }, design: { color: '5' } },
  },
};

describe('A2. SchemaRegistry — accessors & branches', () => {
  const reg = new SchemaRegistry(CUSTOM_SCHEMA);

  it('exposes the raw schema and version', () => {
    expect(reg.getSchema()).toBe(CUSTOM_SCHEMA);
    expect(reg.getSchemaVersion()).toBe(7);
  });

  it('returns the fixed system field list', () => {
    expect(reg.getSystemFields()).toContain('id');
    expect(reg.getSystemFields()).toContain('workstream');
  });

  it('reports settings from the custom schema', () => {
    expect(reg.getIdPadding()).toBe(4);
    expect(reg.getArchiveLayout()).toBe('quarterly');
    expect(reg.getFilenamePattern()).toBe('{id}');
  });

  it('returns empty statuses / fields for an unknown type', () => {
    expect(reg.getStatuses('ghost')).toEqual([]);
    expect(reg.getDefaultStatus('ghost')).toBe('');
    expect(reg.getFields('ghost')).toEqual([]);
    expect(reg.getField('ghost', 'x')).toBeNull();
    expect(reg.getField('widget', 'nope')).toBeNull();
  });

  it('resolves relationships by name and by field', () => {
    expect(reg.getRelationship('linkage')?.name).toBe('linkage');
    expect(reg.getRelationship('missing')).toBeNull();
    expect(reg.getRelationshipByName('linkage')?.label).toBe('Linkage');
    expect(reg.getRelationshipByName('missing')).toBeNull();
    expect(reg.getRelationshipForField('links_to')?.name).toBe('linkage');
    expect(reg.getRelationshipForField('linked_from')?.name).toBe('linkage');
    expect(reg.getRelationshipForField('unknown_field')).toBeNull();
  });

  it('lists relationships that involve a given type (incl. wildcard)', () => {
    expect(reg.getRelationshipsForType('widget').map((r) => r.name)).toEqual(['linkage']);
    expect(reg.getRelationshipsForType('other')).toEqual([]);
  });

  it('resolves per-field cardinality by direction', () => {
    expect(reg.getCardinalityForField('links_to')).toBe('many');
    expect(reg.getCardinalityForField('linked_from')).toBe('many');
  });

  it('throws when resolving cardinality for a field with no relationship', () => {
    expect(() => reg.getCardinalityForField('bogus')).toThrow(/No relationship/);
  });

  it('getValidator is not implemented (throws)', () => {
    expect(() => reg.getValidator('widget')).toThrow();
  });

  it('returns canvas config for a type and a default for unknown types', () => {
    expect(reg.getCanvasConfig('widget')).toMatchObject({ width: 500, color: '2' });
    expect(reg.getCanvasConfig('ghost')).toEqual({ width: 400, height: 300, color: '1', icon: 'file' });
  });

  describe('workstreams — object format', () => {
    it('reads values, default, normalization map, and canvas color', () => {
      expect(reg.getWorkstreams()).toEqual(['engineering', 'design']);
      expect(reg.getDefaultWorkstream()).toBe('engineering');
      expect(reg.normalizeWorkstream('DEV')).toBe('engineering'); // via normalization map
      expect(reg.normalizeWorkstream('Engineering')).toBe('engineering'); // exact match
      expect(reg.normalizeWorkstream('nope')).toBe('nope'); // pass-through
      expect(reg.getWorkstreamColor('engineering')).toBe('3');
      expect(reg.getWorkstreamColor('unknown')).toBe('#808080');
    });
  });

  describe('workstreams — array format (defensive branch)', () => {
    const arraySchema = {
      ...CUSTOM_SCHEMA,
      workstreams: [
        { name: 'engineering', color: '#111', aliases: ['dev', 'eng'] },
        { name: 'design', color: '#222' },
      ],
    } as unknown as Schema;
    const areg = new SchemaRegistry(arraySchema);

    it('reads names, default, aliases, and colors', () => {
      expect(areg.getWorkstreams()).toEqual(['engineering', 'design']);
      expect(areg.getDefaultWorkstream()).toBe('engineering');
      expect(areg.normalizeWorkstream('Engineering')).toBe('engineering'); // exact
      expect(areg.normalizeWorkstream('DEV')).toBe('engineering'); // alias
      expect(areg.normalizeWorkstream('nomatch')).toBe('nomatch'); // pass-through
      expect(areg.getWorkstreamColor('engineering')).toBe('#111');
      expect(areg.getWorkstreamColor('missing')).toBe('#808080');
    });
  });

  describe('workstreams — absent (undefined branch)', () => {
    const noWs = { ...CUSTOM_SCHEMA, workstreams: undefined } as unknown as Schema;
    const nreg = new SchemaRegistry(noWs);

    it('returns safe empty/pass-through defaults', () => {
      expect(nreg.getWorkstreams()).toEqual([]);
      expect(nreg.getDefaultWorkstream()).toBe('');
      expect(nreg.normalizeWorkstream('dev')).toBe('dev');
      expect(nreg.getWorkstreamColor('engineering')).toBe('#808080');
    });
  });
});

describe('A2. SchemaRegistry.load — precedence', () => {
  it('loads schema.json when present and valid (no default)', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/schema.json': JSON.stringify(CUSTOM_SCHEMA),
    });
    const result = await SchemaRegistry.load(fs, '/vault');
    expect(result.usedDefault).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.registry.getSchemaVersion()).toBe(7);
    expect(result.registry.getEntityType('widget')).not.toBeNull();
  });

  it('falls back to default with an error when entityTypes is missing', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/schema.json': JSON.stringify({ relationships: [] }),
    });
    const result = await SchemaRegistry.load(fs, '/vault');
    expect(result.usedDefault).toBe(true);
    expect(result.errors.some((e) => /entityTypes/.test(e))).toBe(true);
    expect(result.registry.getAllEntityTypes()).toHaveLength(6); // DEFAULT_SCHEMA
  });

  it('falls back to default with an error when relationships is missing', async () => {
    const fs = new InMemoryFileSystem({
      '/vault/schema.json': JSON.stringify({ entityTypes: [] }),
    });
    const result = await SchemaRegistry.load(fs, '/vault');
    expect(result.usedDefault).toBe(true);
    expect(result.errors.some((e) => /relationships/.test(e))).toBe(true);
  });

  it('uses the built-in default (no errors) when schema.json is absent', async () => {
    const fs = new InMemoryFileSystem();
    const result = await SchemaRegistry.load(fs, '/vault');
    expect(result.usedDefault).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.registry.getSchema()).toBe(DEFAULT_SCHEMA);
  });
});
