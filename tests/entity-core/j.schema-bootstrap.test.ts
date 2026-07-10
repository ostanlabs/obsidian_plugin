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

  it('flags an invalid positioning.containerEnd', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'milestone' }, { type: 'story' }],
      relationships: [{
        name: 'r', pairs: [{ from: 'story', to: 'milestone', forward: 'parent', reverse: 'children' }],
        positioning: { role: 'containment', containerEnd: 'sideways' },
      }],
    });
    expect(errs.some((e) => /positioning\.containerEnd/.test(e))).toBe(true);
  });

  it('flags an invalid positioning.forwardDirection', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'milestone' }],
      relationships: [{
        name: 'r', pairs: [{ from: 'milestone', to: 'milestone', forward: 'depends_on', reverse: 'blocks' }],
        positioning: { role: 'sequencing', forwardDirection: 'sideways' },
      }],
    });
    expect(errs.some((e) => /positioning\.forwardDirection/.test(e))).toBe(true);
  });

  it('flags a negative positioning.priority', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'decision' }, { type: 'document' }],
      relationships: [{
        name: 'r', pairs: [{ from: 'decision', to: 'document', forward: 'affects', reverse: 'decided_by' }],
        positioning: { role: 'containment', containerEnd: 'to', priority: -1 },
      }],
    });
    expect(errs.some((e) => /positioning\.priority/.test(e))).toBe(true);
  });

  it('accepts a valid positioning block (priority 0)', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'decision' }, { type: 'document' }],
      relationships: [{
        name: 'r', pairs: [{ from: 'decision', to: 'document', forward: 'affects', reverse: 'decided_by' }],
        positioning: { role: 'containment', containerEnd: 'to', priority: 0 },
      }],
    });
    expect(errs.some((e) => /positioning/.test(e))).toBe(false);
  });

  it('flags duplicate entity types', () => {
    const errs = validateSchema({ entityTypes: [{ type: 'x' }, { type: 'x' }], relationships: [] });
    expect(errs.some((e) => /duplicate entity type "x"/.test(e))).toBe(true);
  });

  // -- new schema-model fields: descriptions, validation policy, defaultCanvas --

  it('flags settings.defaultCanvas that is not a string ending in ".canvas"', () => {
    const base = { entityTypes: [], relationships: [] };
    expect(validateSchema({ ...base, settings: { defaultCanvas: 'projects/Project.md' } })
      .some((e) => /defaultCanvas/.test(e))).toBe(true);
    expect(validateSchema({ ...base, settings: { defaultCanvas: 42 } })
      .some((e) => /defaultCanvas/.test(e))).toBe(true);
    expect(validateSchema({ ...base, settings: { defaultCanvas: 'projects/Project.canvas' } })
      .some((e) => /defaultCanvas/.test(e))).toBe(false);
    // absent → fine
    expect(validateSchema({ ...base, settings: {} }).some((e) => /defaultCanvas/.test(e))).toBe(false);
  });

  it('flags non-string descriptions on entity types, fields, and relationships', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'task', description: 7, fields: [{ name: 'goal', kind: 'text', description: [] }] }],
      relationships: [{
        name: 'r', description: {}, pairs: [{ from: 'task', to: 'task', forward: 'f', reverse: 'g' }],
      }],
    });
    expect(errs.some((e) => /entityTypes\[task\]\.description must be a string/.test(e))).toBe(true);
    expect(errs.some((e) => /entityTypes\[task\]\.fields\[goal\]\.description must be a string/.test(e))).toBe(true);
    expect(errs.some((e) => /relationships\[r\]\.description must be a string/.test(e))).toBe(true);
  });

  it('accepts string descriptions everywhere', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'task', description: 'a task', fields: [{ name: 'goal', kind: 'text', description: 'the goal' }] }],
      relationships: [{
        name: 'r', description: 'a rel', pairs: [{ from: 'task', to: 'task', forward: 'f', reverse: 'g' }],
      }],
    });
    expect(errs).toEqual([]);
  });

  it('flags validation.requiredForTypes that is not an array or names unknown types', () => {
    const rel = (validation: unknown) => ({
      entityTypes: [{ type: 'task' }, { type: 'story' }, { type: 'milestone' }],
      relationships: [{
        name: 'hierarchy',
        pairs: [
          { from: 'task', to: 'story', forward: 'parent', reverse: 'children' },
          { from: 'story', to: 'milestone', forward: 'parent', reverse: 'children' },
        ],
        validation,
      }],
    });
    expect(validateSchema(rel({ requiredForTypes: 'task' }))
      .some((e) => /requiredForTypes must be an array/.test(e))).toBe(true);
    expect(validateSchema(rel({ requiredForTypes: ['ghost'] }))
      .some((e) => /requiredForTypes has unknown entity type "ghost"/.test(e))).toBe(true);
    // known type but not a "from" of any pair → flagged
    expect(validateSchema(rel({ requiredForTypes: ['milestone'] }))
      .some((e) => /"milestone" is not a "from" type of any pair/.test(e))).toBe(true);
    // valid: both types appear as pair `from`s
    expect(validateSchema(rel({ requiredForTypes: ['task', 'story'] }))).toEqual([]);
  });

  it('flags non-positive / non-integer fan-out limits', () => {
    const rel = (validation: unknown) => ({
      entityTypes: [{ type: 'document' }, { type: 'feature' }],
      relationships: [{
        name: 'documentation',
        pairs: [{ from: 'document', to: 'feature', forward: 'documents', reverse: 'documented_by' }],
        validation,
      }],
    });
    expect(validateSchema(rel({ maxForwardTargets: 0 }))
      .some((e) => /maxForwardTargets must be a positive integer/.test(e))).toBe(true);
    expect(validateSchema(rel({ maxReverseTargets: -2 }))
      .some((e) => /maxReverseTargets must be a positive integer/.test(e))).toBe(true);
    expect(validateSchema(rel({ maxForwardTargets: 1.5 }))
      .some((e) => /maxForwardTargets must be a positive integer/.test(e))).toBe(true);
    expect(validateSchema(rel({ maxForwardTargets: '2' }))
      .some((e) => /maxForwardTargets must be a positive integer/.test(e))).toBe(true);
    expect(validateSchema(rel({ maxForwardTargets: 2, maxReverseTargets: 2 }))).toEqual([]);
  });

  it('flags a validation block that is not an object', () => {
    const errs = validateSchema({
      entityTypes: [{ type: 'task' }],
      relationships: [{
        name: 'r', pairs: [{ from: 'task', to: 'task', forward: 'f', reverse: 'g' }],
        validation: ['nope'],
      }],
    });
    expect(errs.some((e) => /relationships\[r\]\.validation must be an object/.test(e))).toBe(true);
  });

  it('still accepts the default schema with the new policy fields populated', () => {
    // DEFAULT_SCHEMA now carries descriptions, validation blocks, emitWhenEmpty
    // and settings.defaultCanvas — all must pass.
    expect(validateSchema(DEFAULT_SCHEMA)).toEqual([]);
    expect(DEFAULT_SCHEMA.settings.defaultCanvas).toBe('projects/Project.canvas');
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
