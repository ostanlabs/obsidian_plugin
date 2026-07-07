/**
 * DEFAULT_SCHEMA — the built-in default schema.
 *
 * This is REAL policy data (not a stub): the corrected §2.2 default schema with
 * all 6 entity types and all 7 relationships. Source of truth (in priority order):
 *   1. UNIFICATION_AND_CONFIGURABLE_SCHEMA_SPEC.md v1.1 §2.2 (corrected)
 *   2. UNIFICATION_AND_CONFIGURABLE_SCHEMA_DESIGN.md + MCP_PLUGIN_PARITY_REPORT.md
 *   3. obsidian_mcp/src/models/v2-types.ts (current field/status truth)
 *
 * Correctness invariants the contract suite (A) enforces — DO NOT regress to the
 * pre-correction draft (SPEC_COMPLETION_SUMMARY.md):
 *   - 6 entity types, each fully specified (not "same structure as milestone").
 *   - 7 relationships (hierarchy, dependency, implementation, documentation,
 *     decision-impact, supersession, versioning).
 *   - depends_on's inverse is `blocks` (NOT the deprecated `enables`).
 *   - affects's inverse is `decided_by` (NOT null).
 *   - implements: milestone|story → feature|document.
 *   - per-type statuses differ (decision: Pending/Decided/Superseded, etc.).
 */

import type { Schema } from './types.js';

export const DEFAULT_SCHEMA: Schema = {
  schemaVersion: 1,

  settings: {
    idPadding: 3,
    archiveLayout: 'by-type',
    filenamePattern: '{id}_{title}',
    // Overlap-resolution priority (highest first): higher-priority nodes stay put and
    // lower-priority nodes are nudged aside when two overlap. Single source of truth for
    // positioningV4's overlap resolver.
    overlapPriorityOrder: ['milestone', 'story', 'task', 'decision', 'document', 'feature'],
  },

  entityTypes: [
    {
      type: 'milestone',
      label: 'Milestone',
      idPrefix: 'M',
      folder: 'milestones',
      statuses: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
      defaultStatus: 'Not Started',
      fields: [
        {
          name: 'priority',
          kind: 'enum',
          values: ['Low', 'Medium', 'High', 'Critical'],
          required: true,
          default: 'Medium',
        },
        { name: 'target_date', kind: 'date', required: false },
        { name: 'owner', kind: 'string', required: false },
        { name: 'objective', kind: 'text', required: false },
        { name: 'success_criteria', kind: 'string[]', required: false },
      ],
      canvas: { width: 500, height: 400, color: '6', icon: 'target' },
    },
    {
      type: 'story',
      label: 'Story',
      idPrefix: 'S',
      folder: 'stories',
      statuses: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
      defaultStatus: 'Not Started',
      fields: [
        {
          name: 'priority',
          kind: 'enum',
          values: ['Low', 'Medium', 'High', 'Critical'],
          required: true,
          default: 'Medium',
        },
        { name: 'outcome', kind: 'text', required: false },
        { name: 'acceptance_criteria', kind: 'string[]', required: false },
        { name: 'notes', kind: 'text', required: false },
      ],
      canvas: { width: 400, height: 300, color: '3', icon: 'book' },
    },
    {
      type: 'task',
      label: 'Task',
      idPrefix: 'T',
      folder: 'tasks',
      statuses: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
      defaultStatus: 'Not Started',
      fields: [
        { name: 'goal', kind: 'text', required: true },
        { name: 'estimate_hrs', kind: 'number', required: false },
        { name: 'actual_hrs', kind: 'number', required: false },
        { name: 'assignee', kind: 'string', required: false },
        { name: 'description', kind: 'text', required: false },
        { name: 'technical_notes', kind: 'text', required: false },
        { name: 'notes', kind: 'text', required: false },
      ],
      canvas: { width: 350, height: 250, color: '2', icon: 'check' },
    },
    {
      type: 'decision',
      label: 'Decision',
      idPrefix: 'DEC',
      folder: 'decisions',
      statuses: ['Pending', 'Decided', 'Superseded'],
      defaultStatus: 'Pending',
      fields: [
        { name: 'context', kind: 'text', required: false },
        { name: 'decision', kind: 'text', required: false },
        { name: 'rationale', kind: 'text', required: false },
        { name: 'alternatives', kind: 'string[]', required: false },
        // NOTE: this `decided_by` is a PERSON (string field), distinct from the
        // relationship reverse field `decided_by` written onto affects targets.
        // They share a name but live on different entity types — no collision.
        { name: 'decided_by', kind: 'string', required: false },
        { name: 'decided_on', kind: 'date', required: false },
      ],
      canvas: { width: 400, height: 300, color: '4', icon: 'gavel' },
    },
    {
      type: 'document',
      label: 'Document',
      idPrefix: 'DOC',
      folder: 'documents',
      statuses: ['Draft', 'Review', 'Approved', 'Superseded'],
      defaultStatus: 'Draft',
      fields: [
        {
          name: 'doc_type',
          kind: 'enum',
          values: ['spec', 'adr', 'vision', 'guide', 'research'],
          required: true,
          default: 'spec',
        },
        { name: 'version', kind: 'string', required: false },
        { name: 'owner', kind: 'string', required: false },
        { name: 'implementation_context', kind: 'text', required: false },
        { name: 'content', kind: 'markdown', required: false },
      ],
      canvas: { width: 400, height: 350, color: '5', icon: 'file-text' },
    },
    {
      type: 'feature',
      label: 'Feature',
      idPrefix: 'F',
      folder: 'features',
      statuses: ['Planned', 'In Progress', 'Complete', 'Deferred'],
      defaultStatus: 'Planned',
      fields: [
        { name: 'user_story', kind: 'text', required: true },
        {
          name: 'tier',
          kind: 'enum',
          values: ['OSS', 'Premium'],
          required: true,
          default: 'OSS',
        },
        {
          name: 'phase',
          kind: 'enum',
          values: ['MVP', '0', '1', '2', '3', '4', '5'],
          required: true,
          default: 'MVP',
        },
        {
          name: 'priority',
          kind: 'enum',
          values: ['Low', 'Medium', 'High', 'Critical'],
          required: false,
        },
        { name: 'test_refs', kind: 'string[]', required: false },
        { name: 'content', kind: 'markdown', required: false },
      ],
      canvas: { width: 300, height: 220, color: '1', icon: 'star' },
    },
  ],

  // NOTE: relationship pairs + `positioning` metadata are the SINGLE SOURCE OF TRUTH.
  // The MCP validator (validate_project allow-list) and the plugin positioning engine
  // (positioningV4 RELATIONSHIP_RULES) both DERIVE from here via schema-derivation.ts.
  // Corrected valid set 2026-07-03 (see schema-explorer.html export).
  relationships: [
    {
      name: 'hierarchy',
      label: 'Hierarchy',
      pairs: [
        { from: 'task', to: 'story', forward: 'parent', reverse: 'children' },
        { from: 'story', to: 'milestone', forward: 'parent', reverse: 'children' },
      ],
      cardinality: { forward: 'one', reverse: 'many' },
      canvas: { color: 'gray', style: 'solid' },
      graph: { transitiveReduction: false, cyclePrevention: true },
      // child (from) sits under container (to); e.g. story under milestone.
      positioning: { role: 'containment', containerEnd: 'to' },
    },
    {
      name: 'dependency',
      label: 'Dependency',
      pairs: [
        // depends_on's inverse is `blocks`. Same-type ordering only (m→m, s→s, t→t).
        { from: 'milestone', to: 'milestone', forward: 'depends_on', reverse: 'blocks' },
        { from: 'story', to: 'story', forward: 'depends_on', reverse: 'blocks' },
        { from: 'task', to: 'task', forward: 'depends_on', reverse: 'blocks' },
      ],
      cardinality: { forward: 'many', reverse: 'many' },
      canvas: { color: 'blue', style: 'dashed' },
      graph: { transitiveReduction: true, cyclePrevention: true },
      // sequencing: depends_on => 'after', blocks => 'before'. crossWs suppressed for task.
      positioning: { role: 'sequencing', forwardDirection: 'after', emitReverseRule: true, crossWsPositioning: true, crossWsExcludedTypes: ['task'] },
    },
    {
      name: 'implementation',
      label: 'Implementation',
      pairs: [
        { from: 'milestone', to: 'feature', forward: 'implements', reverse: 'implemented_by' },
        { from: 'story', to: 'feature', forward: 'implements', reverse: 'implemented_by' },
      ],
      cardinality: { forward: 'many', reverse: 'many' },
      canvas: { color: 'purple', style: 'solid' },
      graph: { transitiveReduction: false, cyclePrevention: false },
      // container (from = milestone/story) is the parent; feature (to) sits under it.
      positioning: { role: 'containment', containerEnd: 'from', priority: 1, emitParentRule: true },
    },
    {
      name: 'documentation',
      label: 'Documentation',
      pairs: [
        { from: 'document', to: 'feature', forward: 'documents', reverse: 'documented_by' },
      ],
      cardinality: { forward: 'many', reverse: 'many' },
      canvas: { color: 'yellow', style: 'solid' },
      graph: { transitiveReduction: false, cyclePrevention: false },
      // document (from) sits under the feature (to = container). The parent rule lets a
      // feature claim its documents as children (documented_by → document, direction 'parent'),
      // so features at the top of deep chains keep their documents attached for layout.
      positioning: { role: 'containment', containerEnd: 'to', priority: 1, emitParentRule: true },
    },
    {
      name: 'decision-impact',
      label: 'Affects',
      pairs: [
        // affects's inverse is `decided_by`. Decision sits under the document it affects.
        { from: 'decision', to: 'document', forward: 'affects', reverse: 'decided_by' },
      ],
      cardinality: { forward: 'many', reverse: 'many' },
      canvas: { color: 'yellow', style: 'dotted' },
      graph: { transitiveReduction: false, cyclePrevention: false },
      // decision (from) sits under the document it affects (to = container). The parent rule
      // lets a document claim its decisions as children (decided_by → decision, direction 'parent').
      positioning: { role: 'containment', containerEnd: 'to', priority: 1, emitParentRule: true },
    },
    {
      name: 'supersession',
      label: 'Supersession',
      pairs: [
        { from: 'decision', to: 'decision', forward: 'supersedes', reverse: 'superseded_by' },
      ],
      cardinality: { forward: 'one', reverse: 'one' },
      canvas: { color: 'orange', style: 'solid' },
      graph: { transitiveReduction: false, cyclePrevention: true },
      // supersedes => the newer decision comes 'before' the one it supersedes. No reverse rule.
      positioning: { role: 'sequencing', forwardDirection: 'before', emitReverseRule: false },
    },
    {
      name: 'versioning',
      label: 'Versioning',
      pairs: [
        { from: 'document', to: 'document', forward: 'previous_version', reverse: 'next_version' },
      ],
      cardinality: { forward: 'one', reverse: 'one' },
      canvas: { color: 'gray', style: 'dashed' },
      graph: { transitiveReduction: false, cyclePrevention: true },
      positioning: { role: 'sequencing', forwardDirection: 'after', emitReverseRule: false },
    },
  ],

  workstreams: {
    values: ['engineering', 'business', 'infra', 'research', 'design', 'marketing'],
    default: 'engineering',
    normalization: {
      infrastructure: 'infra',
      ops: 'infra',
      devops: 'infra',
      eng: 'engineering',
      dev: 'engineering',
      development: 'engineering',
      biz: 'business',
      rnd: 'research',
      'r&d': 'research',
      ux: 'design',
      ui: 'design',
      mktg: 'marketing',
    },
    canvas: {
      engineering: { color: '3' },
      business: { color: '6' },
      design: { color: '5' },
      marketing: { color: '1' },
      infra: { color: '4' },
      research: { color: '2' },
    },
  },
};
