/**
 * Contract suite B — Serializer ⇄ Parser round-trip. (TDD plan §4.2.B)
 *
 * The data-loss guard: write each of the 6 types → parse → re-serialize and assert
 * ZERO loss on system fields, custom fields, every relationship field, and unknown
 * passthrough keys. Plus special chars, unicode, multiline body, block/inline arrays.
 *
 * RED now: serialize() / parse() throw NOT_IMPLEMENTED.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry, EntitySerializer, EntityParser, ParseError, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import type { RuntimeEntity } from '../../src/entity-core/types.js';
import { makeEntity } from './harness/entity-factory.js';

describe('B. Serializer ⇄ Parser round-trip', () => {
  let serializer: EntitySerializer;
  let parser: EntityParser;

  beforeEach(() => {
    const reg = new SchemaRegistry(DEFAULT_SCHEMA);
    serializer = new EntitySerializer(reg);
    parser = new EntityParser(reg);
  });

  const roundTrip = (entity: RuntimeEntity): RuntimeEntity => {
    const text = serializer.serialize(entity);
    return parser.parse(text, entity.vault_path);
  };

  it('preserves system fields for a milestone', () => {
    const m = makeEntity('milestone', 'M-001', {
      title: 'Q1 Launch',
      status: 'In Progress',
      workstream: 'engineering',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-06-30T14:30:00Z',
      fields: { priority: 'High', target_date: '2026-03-31', owner: 'Alice' },
      relationships: { children: ['S-001', 'S-002'] },
    });
    const out = roundTrip(m);
    expect(out.id).toBe('M-001');
    expect(out.type).toBe('milestone');
    expect(out.title).toBe('Q1 Launch');
    expect(out.status).toBe('In Progress');
    expect(out.workstream).toBe('engineering');
    expect(out.created_at).toBe('2026-01-01T00:00:00Z');
    expect(out.updated_at).toBe('2026-06-30T14:30:00Z');
    expect(out.fields.priority).toBe('High');
    expect(out.relationships.children).toEqual(['S-001', 'S-002']);
  });

  it('round-trips all 6 entity types without loss of type-specific status', () => {
    const cases: Array<[string, string, string]> = [
      ['milestone', 'M-010', 'Completed'],
      ['story', 'S-010', 'Blocked'],
      ['task', 'T-010', 'Not Started'],
      ['decision', 'DEC-010', 'Decided'],
      ['document', 'DOC-010', 'Approved'],
      ['feature', 'F-010', 'Deferred'],
    ];
    for (const [type, id, status] of cases) {
      const e = makeEntity(type, id, { status });
      const out = roundTrip(e);
      expect(out.type, type).toBe(type);
      expect(out.status, `${type} status`).toBe(status);
      expect(out.id, type).toBe(id);
    }
  });

  it('preserves unknown passthrough keys (notion_page_id, inProgress)', () => {
    const s = makeEntity('story', 'S-100', {
      passthrough: { notion_page_id: 'notion-abc-123', inProgress: true },
    });
    const out = roundTrip(s);
    expect(out.passthrough?.notion_page_id).toBe('notion-abc-123');
    expect(out.passthrough?.inProgress).toBe(true);
  });

  it('preserves every relationship field across types', () => {
    const dec = makeEntity('decision', 'DEC-200', {
      relationships: { affects: ['F-001', 'S-001'], supersedes: 'DEC-199' },
    });
    const out = roundTrip(dec);
    expect(out.relationships.affects).toEqual(['F-001', 'S-001']);
    expect(out.relationships.supersedes).toBe('DEC-199');
  });

  it('preserves titles with special characters (colon, quotes)', () => {
    const e = makeEntity('document', 'DOC-300', {
      title: 'Spec: "Auth" — v2 [draft]',
    });
    expect(roundTrip(e).title).toBe('Spec: "Auth" — v2 [draft]');
  });

  it('preserves unicode and a multiline text body', () => {
    const body = 'First line ✅\nSecond line — café\n第三行';
    const e = makeEntity('milestone', 'M-400', {
      fields: { objective: body },
    });
    expect(roundTrip(e).fields.objective).toBe(body);
  });

  it('preserves string[] arrays regardless of block vs inline style', () => {
    const e = makeEntity('story', 'S-500', {
      fields: { acceptance_criteria: ['All tests pass', 'Docs complete', 'Reviewed'] },
    });
    expect(roundTrip(e).fields.acceptance_criteria).toEqual([
      'All tests pass',
      'Docs complete',
      'Reviewed',
    ]);
  });

  it('is stable across a second round-trip (idempotent serialization)', () => {
    const e = makeEntity('feature', 'F-600', {
      fields: { user_story: 'As a user…', tier: 'Premium', phase: '2' },
      relationships: { implemented_by: ['M-001', 'S-002'] },
    });
    const once = serializer.serialize(e);
    const twice = serializer.serialize(parser.parse(once, e.vault_path));
    expect(twice).toBe(once);
  });
});

describe('B. Parser error & edge paths', () => {
  let parser: EntityParser;
  beforeEach(() => {
    parser = new EntityParser(new SchemaRegistry(DEFAULT_SCHEMA));
  });

  it('ParseError carries the name and message', () => {
    const err = new ParseError('bad');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ParseError');
    expect(err.message).toBe('bad');
  });

  it('throws when the id field is missing or not a string', () => {
    expect(() => parser.parse('---\ntype: milestone\n---\n', 'entities/milestones/x.md' as any)).toThrow(
      /Missing or invalid id/
    );
    expect(() => parser.parse('---\nid: 123\ntype: milestone\n---\n', 'entities/milestones/x.md' as any)).toThrow(
      /Missing or invalid id/
    );
  });

  it('throws when the type field is missing or not a string', () => {
    expect(() => parser.parse('---\nid: M-001\n---\n', 'entities/milestones/x.md' as any)).toThrow(
      /Missing or invalid type/
    );
  });

  it('treats content without frontmatter as empty frontmatter (then fails id check)', () => {
    // No leading `---` block -> extractFrontmatter returns {} -> id check throws.
    expect(() => parser.parse('# Just a body, no frontmatter', 'notes/x.md' as any)).toThrow(
      /Missing or invalid id/
    );
  });

  it('throws a ParseError for malformed YAML frontmatter', () => {
    const bad = '---\nid: M-001\ntype: milestone\n: ::bad yaml:::\n\t- broken\n---\nbody';
    expect(() => parser.parse(bad, 'entities/milestones/x.md' as any)).toThrow(ParseError);
  });
});
