/**
 * Contract suite L — schema-driven status/priority normalizer. (refactor §7)
 *
 * Verifies normalizeStatus/normalizePriority against DEFAULT_SCHEMA for all 6
 * entity types, incl. the feature-status fix (Planned/In Progress/Complete/
 * Deferred), context-dependent aliases, case-insensitive canonical matching,
 * and unknown → schema default.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import {
  normalizeStatus,
  normalizePriority,
} from '../../src/entity-core/status-normalizer.js';

const S = DEFAULT_SCHEMA;

describe('L. status-normalizer (schema-driven)', () => {
  describe('case-insensitive canonical match', () => {
    it('returns the canonical-cased valid status for each type', () => {
      expect(normalizeStatus(S, 'task', 'not started')).toBe('Not Started');
      expect(normalizeStatus(S, 'task', 'IN PROGRESS')).toBe('In Progress');
      expect(normalizeStatus(S, 'decision', 'decided')).toBe('Decided');
      expect(normalizeStatus(S, 'document', 'approved')).toBe('Approved');
      expect(normalizeStatus(S, 'feature', 'complete')).toBe('Complete');
      expect(normalizeStatus(S, 'feature', 'PLANNED')).toBe('Planned');
    });
  });

  describe('unknown / empty → schema default per type', () => {
    it('falls back to the type default status', () => {
      expect(normalizeStatus(S, 'milestone', undefined)).toBe('Not Started');
      expect(normalizeStatus(S, 'story', '')).toBe('Not Started');
      expect(normalizeStatus(S, 'task', 'garbage')).toBe('Not Started');
      expect(normalizeStatus(S, 'decision', 'garbage')).toBe('Pending');
      expect(normalizeStatus(S, 'document', 'garbage')).toBe('Draft');
      expect(normalizeStatus(S, 'feature', 'garbage')).toBe('Planned');
    });
  });

  describe('milestone / story / task', () => {
    it('maps standard aliases', () => {
      expect(normalizeStatus(S, 'task', 'todo')).toBe('Not Started');
      expect(normalizeStatus(S, 'task', 'in_progress')).toBe('In Progress');
      expect(normalizeStatus(S, 'task', 'done')).toBe('Completed');
      expect(normalizeStatus(S, 'task', 'completed')).toBe('Completed');
      expect(normalizeStatus(S, 'task', 'blocked')).toBe('Blocked');
      expect(normalizeStatus(S, 'milestone', 'done')).toBe('Completed');
      expect(normalizeStatus(S, 'story', 'wip')).toBe('In Progress');
    });
  });

  describe('decision', () => {
    it('resolves context-dependent aliases to decision vocabulary', () => {
      expect(normalizeStatus(S, 'decision', 'open')).toBe('Pending');
      expect(normalizeStatus(S, 'decision', 'pending')).toBe('Pending');
      expect(normalizeStatus(S, 'decision', 'approved')).toBe('Decided'); // not "Approved"
      expect(normalizeStatus(S, 'decision', 'done')).toBe('Decided');
      expect(normalizeStatus(S, 'decision', 'deprecated')).toBe('Superseded');
    });
  });

  describe('document', () => {
    it('resolves context-dependent aliases to document vocabulary', () => {
      expect(normalizeStatus(S, 'document', 'draft')).toBe('Draft');
      expect(normalizeStatus(S, 'document', 'in review')).toBe('Review');
      expect(normalizeStatus(S, 'document', 'published')).toBe('Approved');
      expect(normalizeStatus(S, 'document', 'done')).toBe('Approved'); // not "Completed"
      expect(normalizeStatus(S, 'document', 'obsolete')).toBe('Superseded');
    });
  });

  describe('feature (the §7 fix)', () => {
    it('maps to Planned/In Progress/Complete/Deferred, never task vocabulary', () => {
      expect(normalizeStatus(S, 'feature', 'planned')).toBe('Planned');
      expect(normalizeStatus(S, 'feature', 'in progress')).toBe('In Progress');
      expect(normalizeStatus(S, 'feature', 'complete')).toBe('Complete');
      expect(normalizeStatus(S, 'feature', 'completed')).toBe('Complete');
      expect(normalizeStatus(S, 'feature', 'done')).toBe('Complete');
      expect(normalizeStatus(S, 'feature', 'deferred')).toBe('Deferred');
    });
    it('never emits a task-only status like "Completed"/"Not Started"', () => {
      const featureStatuses = S.entityTypes.find((t) => t.type === 'feature')!.statuses;
      for (const input of ['done', 'completed', 'todo', 'blocked', 'garbage']) {
        expect(featureStatuses).toContain(normalizeStatus(S, 'feature', input));
      }
    });
  });

  describe('normalizePriority', () => {
    it('matches the priority enum case-insensitively per type', () => {
      expect(normalizePriority(S, 'task', 'high')).toBe('High');
      expect(normalizePriority(S, 'milestone', 'CRITICAL')).toBe('Critical');
      expect(normalizePriority(S, 'feature', 'low')).toBe('Low');
    });
    it('falls back to the field default (Medium) when empty/unknown', () => {
      expect(normalizePriority(S, 'task', undefined)).toBe('Medium');
      expect(normalizePriority(S, 'task', '')).toBe('Medium');
      expect(normalizePriority(S, 'task', 'urgent')).toBe('Medium');
    });
  });
});
