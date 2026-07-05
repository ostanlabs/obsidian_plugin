/**
 * Contract suite C — EntityValidator. (TDD plan §4.2.C)
 *
 *   - per-type status vocabulary: decision rejects "In Progress"; document rejects
 *     "Blocked"; feature accepts "Deferred".
 *   - cardinality: parent (one) rejects an array; children (many) rejects a scalar
 *     — the §9 setRelationshipIds bug guard.
 *   - relationship target-type matrix, required fields, reference existence.
 *
 * RED now: validate() throws NOT_IMPLEMENTED.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry, EntityValidator, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import type { RuntimeEntity } from '../../src/entity-core/types.js';
import { makeEntity } from './harness/entity-factory.js';

const hasError = (errs: { code: string; field: string }[], code: string, field?: string) =>
  errs.some((e) => e.code === code && (field === undefined || e.field === field));

describe('C. EntityValidator', () => {
  let validator: EntityValidator;
  beforeEach(() => {
    validator = new EntityValidator(new SchemaRegistry(DEFAULT_SCHEMA));
  });

  describe('per-type status vocabulary', () => {
    it('rejects a decision with status "In Progress"', () => {
      const dec = makeEntity('decision', 'DEC-001', { status: 'In Progress' });
      const errs = validator.validate(dec);
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.some((e) => e.field === 'status')).toBe(true);
    });

    it('accepts a decision with status "Decided"', () => {
      const dec = makeEntity('decision', 'DEC-002', { status: 'Decided' });
      expect(validator.validate(dec).some((e) => e.field === 'status')).toBe(false);
    });

    it('rejects a document with status "Blocked"', () => {
      const doc = makeEntity('document', 'DOC-001', {
        status: 'Blocked',
        fields: { doc_type: 'spec' },
      });
      expect(validator.validate(doc).some((e) => e.field === 'status')).toBe(true);
    });

    it('accepts a feature with status "Deferred"', () => {
      const f = makeEntity('feature', 'F-001', {
        status: 'Deferred',
        fields: { user_story: 'As a user…', tier: 'OSS', phase: 'MVP' },
      });
      expect(validator.validate(f).some((e) => e.field === 'status')).toBe(false);
    });
  });

  describe('relationship cardinality', () => {
    it('rejects an array on `parent` (cardinality: one)', () => {
      const s = makeEntity('story', 'S-001', {
        relationships: { parent: ['M-001', 'M-002'] as unknown as string },
      });
      expect(hasError(validator.validate(s), 'cardinality_violation', 'parent')).toBe(true);
    });

    it('rejects a scalar on `children` (cardinality: many)', () => {
      const m = makeEntity('milestone', 'M-001', {
        relationships: { children: 'S-001' as unknown as string },
      });
      expect(hasError(validator.validate(m), 'cardinality_violation', 'children')).toBe(true);
    });

    it('accepts a scalar parent and an array of children', () => {
      const s = makeEntity('story', 'S-002', {
        relationships: { parent: 'M-001', children: ['T-001', 'T-002'] },
      });
      expect(hasError(validator.validate(s), 'cardinality_violation')).toBe(false);
    });
  });

  describe('relationship target-type matrix', () => {
    it("rejects a story `parent` pointing at a task (must be a milestone)", () => {
      const s = makeEntity('story', 'S-003', { relationships: { parent: 'T-999' } });
      expect(hasError(validator.validate(s), 'invalid_relationship_target', 'parent')).toBe(true);
    });

    it('rejects a decision `affects` pointing at a milestone (not an affects target)', () => {
      const dec = makeEntity('decision', 'DEC-003', {
        status: 'Decided',
        relationships: { affects: ['M-001'] },
      });
      expect(hasError(validator.validate(dec), 'invalid_relationship_target', 'affects')).toBe(true);
    });

    it('accepts a decision `affects` pointing at a feature', () => {
      const dec = makeEntity('decision', 'DEC-004', {
        status: 'Decided',
        relationships: { affects: ['F-001'] },
      });
      expect(hasError(validator.validate(dec), 'invalid_relationship_target')).toBe(false);
    });
  });

  describe('required fields', () => {
    it('rejects a task missing the required `goal` field', () => {
      const t = makeEntity('task', 'T-001', { fields: {} });
      expect(validator.validate(t).some((e) => e.field.includes('goal'))).toBe(true);
    });

    it('rejects an entity with an empty title', () => {
      const m = makeEntity('milestone', 'M-002', { title: '' });
      expect(validator.validate(m).some((e) => e.field === 'title')).toBe(true);
    });
  });

  describe('reference existence', () => {
    it('flags a dangling relationship reference', () => {
      const s = makeEntity('story', 'S-004', { relationships: { parent: 'M-404' } });
      const known = new Map<string, RuntimeEntity>([['S-004', s]]); // M-404 absent
      expect(
        validator.validateWithReferences(s, known).some((e) => e.code === 'dangling_reference')
      ).toBe(true);
    });
  });
});
