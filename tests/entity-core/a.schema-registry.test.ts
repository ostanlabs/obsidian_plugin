/**
 * Contract suite A — SchemaRegistry / default schema. (TDD plan §4.2.A)
 *
 * Encodes the CORRECTED default schema. These tests fail the pre-correction
 * draft by design: 6 fully-specified types, 7 relationships, depends_on→blocks
 * (NOT enables), affects→decided_by (NOT null), per-type statuses.
 *
 * RED now: every assertion routes through SchemaRegistry methods which throw
 * NOT_IMPLEMENTED until the registry is wired to DEFAULT_SCHEMA.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import { InMemoryFileSystem } from './harness/in-memory-fs.js';

describe('A. SchemaRegistry / default schema', () => {
  let reg: SchemaRegistry;
  beforeEach(() => {
    reg = new SchemaRegistry(DEFAULT_SCHEMA);
  });

  describe('entity types', () => {
    it('has exactly 6 entity types', () => {
      expect(reg.getAllEntityTypes().map((t) => t.type).sort()).toEqual(
        ['decision', 'document', 'feature', 'milestone', 'story', 'task'].sort()
      );
    });

    it('routes each type to the correct prefix and folder', () => {
      const expectations: Record<string, { prefix: string; folder: string }> = {
        milestone: { prefix: 'M', folder: 'milestones' },
        story: { prefix: 'S', folder: 'stories' },
        task: { prefix: 'T', folder: 'tasks' },
        decision: { prefix: 'DEC', folder: 'decisions' },
        document: { prefix: 'DOC', folder: 'documents' },
        feature: { prefix: 'F', folder: 'features' },
      };
      for (const [type, exp] of Object.entries(expectations)) {
        const def = reg.getEntityType(type);
        expect(def, type).not.toBeNull();
        expect(def!.idPrefix, type).toBe(exp.prefix);
        expect(def!.folder, type).toBe(exp.folder);
      }
    });

    it('returns null for an unknown type', () => {
      expect(reg.getEntityType('epic')).toBeNull();
    });
  });

  describe('per-type statuses (must differ by type)', () => {
    it('decision statuses are Pending/Decided/Superseded', () => {
      expect(reg.getStatuses('decision')).toEqual(['Pending', 'Decided', 'Superseded']);
      expect(reg.getDefaultStatus('decision')).toBe('Pending');
    });

    it('document statuses are Draft/Review/Approved/Superseded', () => {
      expect(reg.getStatuses('document')).toEqual(['Draft', 'Review', 'Approved', 'Superseded']);
    });

    it('feature statuses are Planned/In Progress/Complete/Deferred', () => {
      expect(reg.getStatuses('feature')).toEqual(['Planned', 'In Progress', 'Complete', 'Deferred']);
    });

    it('milestone/story/task share Not Started/In Progress/Completed/Blocked', () => {
      const expected = ['Not Started', 'In Progress', 'Completed', 'Blocked'];
      expect(reg.getStatuses('milestone')).toEqual(expected);
      expect(reg.getStatuses('story')).toEqual(expected);
      expect(reg.getStatuses('task')).toEqual(expected);
    });
  });

  describe('per-type fields', () => {
    it('feature has user_story, tier and phase', () => {
      const names = reg.getFields('feature').map((f) => f.name);
      expect(names).toContain('user_story');
      expect(names).toContain('tier');
      expect(names).toContain('phase');
    });

    it('feature.tier is an enum of OSS/Premium', () => {
      const tier = reg.getField('feature', 'tier');
      expect(tier?.kind).toBe('enum');
      expect(tier?.values).toEqual(['OSS', 'Premium']);
    });

    it('decision has decided_on and a person-string decided_by field', () => {
      const names = reg.getFields('decision').map((f) => f.name);
      expect(names).toContain('decided_on');
      const decidedBy = reg.getField('decision', 'decided_by');
      expect(decidedBy?.kind).toBe('string');
    });

    it('task requires goal', () => {
      expect(reg.getField('task', 'goal')?.required).toBe(true);
    });
  });

  describe('relationships', () => {
    it('has exactly 7 relationships', () => {
      const names = reg.getAllRelationships().map((r) => r.name).sort();
      expect(names).toEqual(
        [
          'decision-impact',
          'dependency',
          'documentation',
          'hierarchy',
          'implementation',
          'supersession',
          'versioning',
        ].sort()
      );
    });

    it("dependency's inverse is `blocks`, NOT the deprecated `enables`", () => {
      const dep = reg.getRelationship('dependency');
      expect(dep).not.toBeNull();
      const pair = dep!.pairs[0];
      expect(pair.forward).toBe('depends_on');
      expect(pair.reverse).toBe('blocks');
      // The deprecated `enables` must not appear anywhere in the schema.
      const allReverses = reg.getAllRelationships().flatMap((r) => r.pairs.map((p) => p.reverse));
      const allForwards = reg.getAllRelationships().flatMap((r) => r.pairs.map((p) => p.forward));
      expect([...allForwards, ...allReverses]).not.toContain('enables');
    });

    it("affects's inverse is `decided_by` (never null)", () => {
      const di = reg.getRelationship('decision-impact');
      expect(di).not.toBeNull();
      for (const pair of di!.pairs) {
        expect(pair.forward).toBe('affects');
        expect(pair.reverse).toBe('decided_by');
        expect(pair.from).toBe('decision');
      }
    });

    it('implementation goes milestone|story → feature', () => {
      const impl = reg.getRelationship('implementation');
      const froms = new Set(impl!.pairs.map((p) => p.from));
      const tos = new Set(impl!.pairs.map((p) => p.to));
      expect(froms).toEqual(new Set(['milestone', 'story']));
      expect(tos).toEqual(new Set(['feature']));
      for (const p of impl!.pairs) {
        expect(p.forward).toBe('implements');
        expect(p.reverse).toBe('implemented_by');
      }
    });

    it('documentation is documents/documented_by', () => {
      const doc = reg.getRelationship('documentation');
      expect(doc!.pairs[0]).toMatchObject({
        from: 'document',
        to: 'feature',
        forward: 'documents',
        reverse: 'documented_by',
      });
    });

    it('supersession and versioning are one-to-one', () => {
      expect(reg.getRelationship('supersession')!.cardinality).toEqual({
        forward: 'one',
        reverse: 'one',
      });
      expect(reg.getRelationship('versioning')!.cardinality).toEqual({
        forward: 'one',
        reverse: 'one',
      });
    });

    it('hierarchy is one parent / many children', () => {
      expect(reg.getRelationship('hierarchy')!.cardinality).toEqual({
        forward: 'one',
        reverse: 'many',
      });
    });

    it('resolves a relationship by its field name', () => {
      expect(reg.getRelationshipForField('blocks')?.name).toBe('dependency');
      expect(reg.getRelationshipForField('children')?.name).toBe('hierarchy');
    });

    it('resolves direction-correct cardinality per field (the §9 bug guard)', () => {
      // parent is the forward side of hierarchy (one); children the reverse (many).
      expect(reg.getCardinalityForField('parent')).toBe('one');
      expect(reg.getCardinalityForField('children')).toBe('many');
    });
  });

  describe('settings + workstreams', () => {
    it('idPadding is at least 3', () => {
      expect(reg.getIdPadding()).toBeGreaterThanOrEqual(3);
    });

    it('archive layout defaults to by-type', () => {
      expect(reg.getArchiveLayout()).toBe('by-type');
    });

    it('normalizes workstream aliases', () => {
      expect(reg.normalizeWorkstream('dev')).toBe('engineering');
      expect(reg.normalizeWorkstream('infrastructure')).toBe('infra');
      expect(reg.normalizeWorkstream('ux')).toBe('design');
    });
  });

  describe('loading precedence', () => {
    it('uses the built-in default when schema.json is absent', async () => {
      const fs = new InMemoryFileSystem();
      const result = await SchemaRegistry.load(fs, '/vault');
      expect(result.usedDefault).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.registry.getAllEntityTypes()).toHaveLength(6);
    });

    it('falls back to default with errors[] when schema.json is invalid', async () => {
      const fs = new InMemoryFileSystem({ '/vault/schema.json': '{ not valid json' });
      const result = await SchemaRegistry.load(fs, '/vault');
      expect(result.usedDefault).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
