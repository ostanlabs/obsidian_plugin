/**
 * Suite J — schema-bootstrap. Serialize / validate / load-or-inject the vault schema.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEMA } from '../../src/entity-core/default-schema.js';
import {
  SCHEMA_FILENAME,
  serializeSchema,
  validateSchema,
  loadOrBootstrapSchema,
  loadSchemaOrDefault,
} from '../../src/entity-core/schema-bootstrap.js';
import { InMemoryFileSystem } from './harness/in-memory-fs.js';

describe('J. serializeSchema', () => {
  it('produces valid JSON that round-trips to the schema', () => {
    const text = serializeSchema(DEFAULT_SCHEMA);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(DEFAULT_SCHEMA);
  });
});

describe('J. validateSchema', () => {
  it('accepts the default schema', () => {
    expect(validateSchema(DEFAULT_SCHEMA)).toEqual([]);
  });

  it('rejects non-objects and missing top-level arrays', () => {
    expect(validateSchema(null).length).toBeGreaterThan(0);
    expect(validateSchema('x' as unknown).length).toBeGreaterThan(0);
    expect(validateSchema({ entityTypes: [] }).some((e) => /relationships/.test(e))).toBe(true);
    expect(validateSchema({ relationships: [] }).some((e) => /entityTypes/.test(e))).toBe(true);
  });

  it('flags a relationship missing name/pairs and a pair missing endpoints', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'milestone' }],
      relationships: [{ pairs: [{ from: 'milestone', forward: 'p' }] }],
    });
    expect(errs.some((e) => /missing "name"/.test(e))).toBe(true);
    expect(errs.some((e) => /missing "to"/.test(e))).toBe(true);
    expect(errs.some((e) => /missing "reverse"/.test(e))).toBe(true);
  });

  it('flags an unknown target type and a bad positioning.role', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'milestone' }, { type: 'story' }],
      relationships: [{
        name: 'r', pairs: [{ from: 'milestone', to: 'nope', forward: 'f', reverse: 'g' }],
        positioning: { role: 'sideways' },
      }],
    });
    expect(errs.some((e) => /unknown type "nope"/.test(e))).toBe(true);
    expect(errs.some((e) => /positioning\.role/.test(e))).toBe(true);
  });

  it('flags duplicate entity types', () => {
    const errs = validateSchema({ entityTypes: [{ type: 'x' }, { type: 'x' }], relationships: [] });
    expect(errs.some((e) => /duplicate entity type "x"/.test(e))).toBe(true);
  });
});

describe('J. loadOrBootstrapSchema (may write)', () => {
  it('missing → injects the default and reports wroteDefault', async () => {
    const fs = new InMemoryFileSystem();
    const r = await loadOrBootstrapSchema(fs, '');
    expect(r.wroteDefault).toBe(true);
    expect(r.source).toBe('default');
    expect(r.errors).toEqual([]);
    expect(await fs.exists(SCHEMA_FILENAME)).toBe(true);
    // the file we wrote is the default and re-loads as source:file
    const r2 = await loadOrBootstrapSchema(fs, '');
    expect(r2.source).toBe('file');
    expect(r2.wroteDefault).toBe(false);
    expect(r2.schema.relationships.length).toBe(DEFAULT_SCHEMA.relationships.length);
  });

  it('present + valid → uses the file (source:file)', async () => {
    const fs = new InMemoryFileSystem({ 'schema.json': serializeSchema(DEFAULT_SCHEMA) });
    const r = await loadOrBootstrapSchema(fs, '');
    expect(r.source).toBe('file');
    expect(r.errors).toEqual([]);
  });

  it('present + invalid JSON → default + surfaced error, no crash', async () => {
    const fs = new InMemoryFileSystem({ 'schema.json': '{ not json' });
    const r = await loadOrBootstrapSchema(fs, '');
    expect(r.source).toBe('default');
    expect(r.errors.some((e) => /not valid JSON/.test(e))).toBe(true);
  });

  it('present + valid-JSON-but-invalid-schema → default + validation errors', async () => {
    const fs = new InMemoryFileSystem({ 'schema.json': JSON.stringify({ entityTypes: [], relationships: 'nope' }) });
    const r = await loadOrBootstrapSchema(fs, '');
    expect(r.source).toBe('default');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('honours the dir argument (project-relative path)', async () => {
    const fs = new InMemoryFileSystem();
    await loadOrBootstrapSchema(fs, 'Projects/Alpha');
    expect(await fs.exists('Projects/Alpha/schema.json')).toBe(true);
    expect(await fs.exists('schema.json')).toBe(false);
  });
});

describe('J. loadSchemaOrDefault (read-only)', () => {
  it('missing → default and NEVER writes', async () => {
    const fs = new InMemoryFileSystem();
    const r = await loadSchemaOrDefault(fs, 'Projects/Alpha');
    expect(r.source).toBe('default');
    expect(r.wroteDefault).toBe(false);
    expect(await fs.exists('Projects/Alpha/schema.json')).toBe(false);
  });

  it('present + valid → uses the file', async () => {
    const fs = new InMemoryFileSystem({ 'schema.json': serializeSchema(DEFAULT_SCHEMA) });
    expect((await loadSchemaOrDefault(fs, '')).source).toBe('file');
  });

  it('present + invalid → default + errors (still no write)', async () => {
    const fs = new InMemoryFileSystem({ 'schema.json': '{bad' });
    const r = await loadSchemaOrDefault(fs, '');
    expect(r.source).toBe('default');
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
