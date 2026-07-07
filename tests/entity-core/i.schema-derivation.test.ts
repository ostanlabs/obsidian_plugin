/**
 * Suite I — schema-derivation. The single-source adapters that turn the schema into
 * the MCP validator allow-list and the plugin positioning ruleset.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEMA } from '../../src/entity-core/default-schema.js';
import {
  buildValidationAllowList,
  buildRelationshipRules,
  type DerivedRelationshipRule,
} from '../../src/entity-core/schema-derivation.js';
import type { Schema } from '../../src/entity-core/types.js';

const rule = (rules: DerivedRelationshipRule[], sourceType: string, field: string) =>
  rules.find((r) => r.sourceType === sourceType && r.field === field);

describe('I. buildValidationAllowList (default schema)', () => {
  const allow = buildValidationAllowList(DEFAULT_SCHEMA);

  it('derives the exact allow-list per entity type', () => {
    expect(allow.milestone).toEqual({ children: ['story'], depends_on: ['milestone'], blocks: ['milestone'], implements: ['feature'] });
    expect(allow.story).toEqual({ parent: ['milestone'], children: ['task'], depends_on: ['story'], blocks: ['story'], implements: ['feature'] });
    expect(allow.task).toEqual({ parent: ['story'], depends_on: ['task'], blocks: ['task'] });
    expect(allow.decision).toEqual({ affects: ['document'], supersedes: ['decision'], superseded_by: ['decision'] });
    expect(allow.document).toEqual({ documents: ['feature'], previous_version: ['document'], decided_by: ['decision'], next_version: ['document'] });
    expect(allow.feature).toEqual({ implemented_by: ['milestone', 'story'], documented_by: ['document'] });
  });

  it('covers both directions of every pair (forward on from, reverse on to)', () => {
    // hierarchy story→milestone: story.parent + milestone.children
    expect(allow.story.parent).toContain('milestone');
    expect(allow.milestone.children).toContain('story');
  });
});

describe('I. buildRelationshipRules (default schema)', () => {
  const rules = buildRelationshipRules(DEFAULT_SCHEMA);

  it('emits the milestone workstream root rule first', () => {
    expect(rules[0]).toEqual({ sourceType: 'milestone', field: 'workstream', targetType: 'workstream', action: 'containment', direction: 'child' });
  });

  it('aggregates feature.implemented_by target types across pairs', () => {
    const r = rule(rules, 'feature', 'implemented_by')!;
    expect(r.action).toBe('containment');
    expect(r.direction).toBe('child');
    expect(r.priority).toBe(1);
    expect(new Set(r.targetType as string[])).toEqual(new Set(['milestone', 'story']));
  });

  it('emits the parent-side mirror rule when emitParentRule is set (implementation)', () => {
    // milestone.implements → feature (direction parent)
    const m = rule(rules, 'milestone', 'implements')!;
    expect(m).toMatchObject({ targetType: 'feature', action: 'containment', direction: 'parent' });
  });

  it('decision.affects is containment → document (priority 1)', () => {
    expect(rule(rules, 'decision', 'affects')).toMatchObject({ targetType: 'document', action: 'containment', direction: 'child', priority: 1 });
  });

  it('documentation emitParentRule: feature.documented_by → document (direction parent)', () => {
    expect(rule(rules, 'feature', 'documented_by')).toMatchObject({ targetType: 'document', action: 'containment', direction: 'parent' });
  });

  it('decision-impact emitParentRule: document.decided_by → decision (direction parent)', () => {
    expect(rule(rules, 'document', 'decided_by')).toMatchObject({ targetType: 'decision', action: 'containment', direction: 'parent' });
  });

  it('sequencing: depends_on=after / blocks=before, crossWs suppressed for task', () => {
    expect(rule(rules, 'milestone', 'depends_on')).toMatchObject({ action: 'sequencing', direction: 'after', crossWsPositioning: true });
    expect(rule(rules, 'milestone', 'blocks')).toMatchObject({ direction: 'before', crossWsPositioning: true });
    expect(rule(rules, 'task', 'depends_on')).toMatchObject({ direction: 'after', crossWsPositioning: false });
    expect(rule(rules, 'task', 'blocks')).toMatchObject({ direction: 'before', crossWsPositioning: false });
  });

  it('supersession=before (no reverse rule), versioning=after', () => {
    expect(rule(rules, 'decision', 'supersedes')).toMatchObject({ action: 'sequencing', direction: 'before' });
    expect(rule(rules, 'decision', 'superseded_by')).toBeUndefined();
    expect(rule(rules, 'document', 'previous_version')).toMatchObject({ action: 'sequencing', direction: 'after' });
    expect(rule(rules, 'document', 'next_version')).toBeUndefined();
  });
});

describe('I. derivation on custom / edge schemas', () => {
  const base = { schemaVersion: 1, settings: {}, entityTypes: [], workstreams: {} } as unknown as Schema;

  it('empty relationships → empty allow-list + only the workstream rule', () => {
    const s = { ...base, relationships: [] } as Schema;
    expect(buildValidationAllowList(s)).toEqual({});
    const rules = buildRelationshipRules(s);
    expect(rules).toHaveLength(1);
    expect(rules[0].field).toBe('workstream');
  });

  it('single containment pair (containerEnd:to) → one child rule, no parent mirror', () => {
    const s = { ...base, relationships: [{
      name: 'h', label: 'H',
      pairs: [{ from: 'task', to: 'story', forward: 'parent', reverse: 'children' }],
      cardinality: { forward: 'one', reverse: 'many' }, canvas: {}, graph: {},
      positioning: { role: 'containment', containerEnd: 'to' },
    }] } as unknown as Schema;
    const rules = buildRelationshipRules(s).filter((r) => r.field !== 'workstream');
    expect(rules).toEqual([{ sourceType: 'task', field: 'parent', targetType: 'story', action: 'containment', direction: 'child' }]);
    expect(buildValidationAllowList(s)).toEqual({ task: { parent: ['story'] }, story: { children: ['task'] } });
  });

  it('wildcard "*" endpoints are skipped in the allow-list', () => {
    const s = { ...base, relationships: [{
      name: 'dep', label: 'Dep',
      pairs: [{ from: '*', to: '*', forward: 'depends_on', reverse: 'blocks' }],
      cardinality: { forward: 'many', reverse: 'many' }, canvas: {}, graph: {},
      positioning: { role: 'sequencing', forwardDirection: 'after', emitReverseRule: true },
    }] } as unknown as Schema;
    expect(buildValidationAllowList(s)).toEqual({});
  });

  it('crossWsExcludedTypes controls which endpoints get cross-ws positioning (default ["task"])', () => {
    // Absent field ⇒ default excludes only 'task'
    const dflt = { ...base, relationships: [{
      name: 'dep', label: 'Dep',
      pairs: [
        { from: 'story', to: 'story', forward: 'depends_on', reverse: 'blocks' },
        { from: 'task', to: 'task', forward: 'depends_on', reverse: 'blocks' },
      ],
      cardinality: { forward: 'many', reverse: 'many' }, canvas: {}, graph: {},
      positioning: { role: 'sequencing', forwardDirection: 'after', emitReverseRule: true, crossWsPositioning: true },
    }] } as unknown as Schema;
    const dr = buildRelationshipRules(dflt);
    expect(rule(dr, 'story', 'depends_on')).toMatchObject({ crossWsPositioning: true });
    expect(rule(dr, 'task', 'depends_on')).toMatchObject({ crossWsPositioning: false });

    // Explicit override: exclude 'story' instead of 'task'
    const custom = { ...base, relationships: [{
      name: 'dep', label: 'Dep',
      pairs: [
        { from: 'story', to: 'story', forward: 'depends_on', reverse: 'blocks' },
        { from: 'task', to: 'task', forward: 'depends_on', reverse: 'blocks' },
      ],
      cardinality: { forward: 'many', reverse: 'many' }, canvas: {}, graph: {},
      positioning: { role: 'sequencing', forwardDirection: 'after', emitReverseRule: true, crossWsPositioning: true, crossWsExcludedTypes: ['story'] },
    }] } as unknown as Schema;
    const cr = buildRelationshipRules(custom);
    expect(rule(cr, 'story', 'depends_on')).toMatchObject({ crossWsPositioning: false });
    expect(rule(cr, 'task', 'depends_on')).toMatchObject({ crossWsPositioning: true });
  });

  it('relationship with no positioning metadata emits no rules', () => {
    const s = { ...base, relationships: [{
      name: 'x', label: 'X',
      pairs: [{ from: 'a', to: 'b', forward: 'f', reverse: 'r' }],
      cardinality: { forward: 'one', reverse: 'one' }, canvas: {}, graph: {},
    }] } as unknown as Schema;
    expect(buildRelationshipRules(s).filter((r) => r.field !== 'workstream')).toEqual([]);
    // still contributes to the allow-list (validation is pair-driven, not positioning-driven)
    expect(buildValidationAllowList(s)).toEqual({ a: { f: ['b'] }, b: { r: ['a'] } });
  });

  // D2 (derivation half of the crossWs guarantee — see the REGRESSION-LOCK block below).
  // Documents that crossWsPositioning is a *derivation-only* flag: when the relationship does
  // NOT set crossWsPositioning, NO derived rule carries the property at all (absence is
  // preserved, not defaulted to false). The engine does not consume this flag for layout
  // (positioningV4 only assigns it onto ProcessedRelationship and never reads it back), so a
  // layout-level cross-ws-exclusion test is intentionally NOT written here — it would assert a
  // no-op. If the refactor wires the flag into layout, add the layout test THEN.
  it('crossWsPositioning is absent (not false) on rules whose relationship omits it', () => {
    const s = { ...base, relationships: [{
      name: 'dep', label: 'Dep',
      pairs: [{ from: 'story', to: 'story', forward: 'depends_on', reverse: 'blocks' }],
      cardinality: { forward: 'many', reverse: 'many' }, canvas: {}, graph: {},
      positioning: { role: 'sequencing', forwardDirection: 'after', emitReverseRule: true },
    }] } as unknown as Schema;
    const rules = buildRelationshipRules(s).filter((r) => r.field !== 'workstream');
    for (const r of rules) {
      expect('crossWsPositioning' in r).toBe(false);
    }
  });
});

// ===========================================================================
// REGRESSION-LOCK (a) — pin buildRelationshipRules(DEFAULT_SCHEMA) as a whole.
//
// The per-rule assertions above catch individual regressions but let a refactor
// add / drop / duplicate a rule and still pass. These lock the whole output: the
// exact count, a full order-insensitive set-equality snapshot, priority provenance,
// and no-reverse / parent-rule suppression at the count level. This is the primary
// derivation safety net for the upcoming unification refactor.
// ===========================================================================
describe('I. REGRESSION-LOCK: buildRelationshipRules(DEFAULT_SCHEMA) whole-output', () => {
  const rules = buildRelationshipRules(DEFAULT_SCHEMA);

  // Stable, order-insensitive key. Array targetType is sorted+joined so aggregation order
  // (e.g. implemented_by → [milestone, story]) doesn't matter. undefined priority /
  // crossWsPositioning collapse to '' so their ABSENCE is part of the locked identity.
  const key = (r: DerivedRelationshipRule) => {
    const target = Array.isArray(r.targetType) ? [...r.targetType].sort().join(',') : r.targetType;
    const pri = r.priority === undefined ? '' : String(r.priority);
    const xws = r.crossWsPositioning === undefined ? '' : String(r.crossWsPositioning);
    return [r.sourceType, r.field, target, r.action, r.direction, pri, xws].join('|');
  };

  // A1 — exact rule count. Catches any added / dropped / duplicated rule.
  it('A1: derives exactly 18 rules', () => {
    expect(rules).toHaveLength(18);
  });

  // A2 — full ruleset snapshot as order-insensitive set equality. Locks the containment vs
  // sequencing split, every parent mirror (10,11,13,15), every child rule + its priority,
  // target-type aggregation on implemented_by, the crossWs flags, and that NO extra rule leaks in.
  it('A2: equals the exact expected 18-rule set', () => {
    const expected = [
      'milestone|workstream|workstream|containment|child||',
      'task|parent|story|containment|child||',
      'story|parent|milestone|containment|child||',
      'milestone|depends_on|milestone|sequencing|after||true',
      'milestone|blocks|milestone|sequencing|before||true',
      'story|depends_on|story|sequencing|after||true',
      'story|blocks|story|sequencing|before||true',
      'task|depends_on|task|sequencing|after||false',
      'task|blocks|task|sequencing|before||false',
      'milestone|implements|feature|containment|parent||',
      'story|implements|feature|containment|parent||',
      'feature|implemented_by|milestone,story|containment|child|1|',
      'feature|documented_by|document|containment|parent||',
      'document|documents|feature|containment|child|1|',
      'document|decided_by|decision|containment|parent||',
      'decision|affects|document|containment|child|1|',
      'decision|supersedes|decision|sequencing|before||',
      'document|previous_version|document|sequencing|after||',
    ];
    const actual = rules.map(key);
    // no duplicates (set size === array length) and exact set-equality
    expect(new Set(actual).size).toBe(actual.length);
    expect(new Set(actual)).toEqual(new Set(expected));
  });

  // A3 — priority provenance. hierarchy-derived child rules carry NO priority (schema omits it);
  // implementation / documentation / decision-impact child rules carry priority 1 (schema sets it).
  it('A3: priority flows from schema positioning.priority', () => {
    expect(rule(rules, 'task', 'parent')!.priority).toBeUndefined();   // hierarchy
    expect(rule(rules, 'story', 'parent')!.priority).toBeUndefined();  // hierarchy
    expect(rule(rules, 'feature', 'implemented_by')!.priority).toBe(1); // implementation
    expect(rule(rules, 'document', 'documents')!.priority).toBe(1);     // documentation
    expect(rule(rules, 'decision', 'affects')!.priority).toBe(1);       // decision-impact
  });

  // A4 — no-reverse / parent-rule suppression at the COUNT level.
  it('A4: emitReverseRule:false suppresses reverse rules; emitParentRule emits exactly one mirror', () => {
    // supersession / versioning set emitReverseRule:false → no reverse rule of any kind.
    expect(rule(rules, 'decision', 'superseded_by')).toBeUndefined();
    expect(rule(rules, 'document', 'next_version')).toBeUndefined();
    // exactly one parent mirror per emitParentRule relationship (not zero, not duplicated).
    expect(rules.filter((r) => r.sourceType === 'document' && r.field === 'decided_by')).toHaveLength(1);
    expect(rules.filter((r) => r.sourceType === 'feature' && r.field === 'documented_by')).toHaveLength(1);
    expect(rules.filter((r) => r.field === 'implements' && r.direction === 'parent')).toHaveLength(2); // milestone + story
  });
});
