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
    // Canonical convention matching the production vault: TITLE-ONLY filenames
    // (no id prefix), PRESERVE-case slugs (spaces→_, hyphens kept, case preserved).
    // e.g. "Add 90-day retention policy" → "Add_90-day_retention_policy.md".
    filenamePattern: '{title}',
    filenameCase: 'preserve',
    // Overlap-resolution priority (highest first): higher-priority nodes stay put and
    // lower-priority nodes are nudged aside when two overlap. Single source of truth for
    // positioningV4's overlap resolver.
    overlapPriorityOrder: ['milestone', 'story', 'task', 'decision', 'document', 'feature'],
    // Vault-relative canvas file the MCP bootstraps on first connect.
    defaultCanvas: 'projects/Project.canvas',
  },

  entityTypes: [
    {
      type: 'milestone',
      label: 'Milestone',
      description:
        'Top-level unit of delivery: a significant, dated outcome. Contains stories (children), ' +
        'can depend on / block other milestones, and implements features. Milestones are the ' +
        'roots of the canvas — each sits directly in its workstream lane with no parent.',
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
      description:
        'A user-visible slice of work under a milestone. Requires a parent milestone, contains ' +
        'tasks (children), can depend on / block other stories, and implements features. On the ' +
        'canvas a story sits inside its parent milestone.',
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
      description:
        'The smallest actionable unit of work. Requires a parent story and can depend on / block ' +
        'other tasks. On the canvas a task sits inside its parent story; tasks are exempt from ' +
        'cross-workstream dependency positioning.',
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
      description:
        'A recorded choice (ADR-style): context, the decision itself, rationale, and alternatives. ' +
        'Its `affects` field lists the entities it materially changes (documents in the default ' +
        'schema); a newer decision may supersede an older one. On the canvas a decision sits under ' +
        'the document it affects.',
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
        {
          name: 'decided_by',
          kind: 'string',
          required: false,
          description:
            'The PERSON who made the decision (free-form name). Not to be confused with the ' +
            "decision-impact relationship's reverse field of the same name, which lives on the " +
            'affected targets (documents) and lists decision IDs.',
        },
        {
          name: 'decided_on',
          kind: 'date',
          required: false,
          description: 'Date the decision was made (status moves Pending → Decided).',
        },
      ],
      canvas: { width: 400, height: 300, color: '4', icon: 'gavel' },
    },
    {
      type: 'document',
      label: 'Document',
      description:
        'Long-form written knowledge (spec, ADR, vision, guide, research). Documents the features ' +
        'it covers (`documents`), records the decisions that shaped it (`decided_by`), and chains ' +
        'versions via previous_version/next_version. On the canvas a document sits under the ' +
        'feature it documents and contains the decisions that affect it.',
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
        {
          name: 'implementation_context',
          kind: 'text',
          required: false,
          description:
            'Where/how this document applies in the codebase or system (modules, repos, ' +
            'constraints) — orientation for whoever implements against it.',
        },
        { name: 'content', kind: 'markdown', required: false },
      ],
      canvas: { width: 400, height: 350, color: '5', icon: 'file-text' },
    },
    {
      type: 'feature',
      label: 'Feature',
      description:
        'A product capability described as a user story, tracked by tier and phase. Realized by ' +
        'milestones/stories (`implemented_by`) and described by documents (`documented_by`). On ' +
        'the canvas a feature sits under the milestone or story that implements it, and contains ' +
        'the documents that document it.',
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
          description: 'Product tier the feature ships in: OSS (free/open) or Premium (paid).',
        },
        {
          name: 'phase',
          kind: 'enum',
          values: ['MVP', '0', '1', '2', '3', '4', '5'],
          required: true,
          default: 'MVP',
          description: 'Roadmap phase the feature is slated for (MVP, then numbered phases 0-5).',
        },
        {
          name: 'priority',
          kind: 'enum',
          values: ['Low', 'Medium', 'High', 'Critical'],
          required: false,
        },
        {
          name: 'test_refs',
          kind: 'string[]',
          required: false,
          description: 'References to the tests/suites that verify this feature (paths or test names).',
        },
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
      description:
        'The containment backbone: `parent` on a task points to its story, on a story to its ' +
        'milestone; the reverse field `children` on the container lists what it holds. On the ' +
        'canvas the child sits inside its parent (task in story, story in milestone). Tasks and ' +
        'stories MUST have a parent — a missing one is an ORPHANED_ENTITY violation.',
      pairs: [
        { from: 'task', to: 'story', forward: 'parent', reverse: 'children' },
        { from: 'story', to: 'milestone', forward: 'parent', reverse: 'children' },
      ],
      cardinality: { forward: 'one', reverse: 'many' },
      canvas: { color: 'gray', style: 'solid' },
      graph: { transitiveReduction: false, cyclePrevention: true },
      // child (from) sits under container (to); e.g. story under milestone.
      positioning: { role: 'containment', containerEnd: 'to' },
      // tasks/stories without a parent are hard ORPHANED_ENTITY violations (was mcp.ts:2050).
      validation: { requiredForTypes: ['task', 'story'] },
      // always show the `parent` slot in frontmatter, even when empty.
      emitWhenEmpty: true,
    },
    {
      name: 'dependency',
      label: 'Dependency',
      description:
        '`depends_on` lists the same-type entities that must complete before this one can proceed; ' +
        'the reverse field `blocks` is written onto those prerequisites. Same-type only ' +
        '(milestone→milestone, story→story, task→task). Sequencing on the canvas: an entity is ' +
        'placed AFTER what it depends on and BEFORE what it blocks.',
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
      // always show the `depends_on` slot in frontmatter, even when empty.
      emitWhenEmpty: true,
    },
    {
      name: 'implementation',
      label: 'Implementation',
      description:
        '`implements` on a milestone or story lists the features that work realizes; the reverse ' +
        'field `implemented_by` on the feature lists its implementers. On the canvas the feature ' +
        'sits under the milestone/story that implements it (the implementer is the container). ' +
        'Advisory: a feature should have at most 3 implementers.',
      pairs: [
        { from: 'milestone', to: 'feature', forward: 'implements', reverse: 'implemented_by' },
        { from: 'story', to: 'feature', forward: 'implements', reverse: 'implemented_by' },
      ],
      cardinality: { forward: 'many', reverse: 'many' },
      canvas: { color: 'purple', style: 'solid' },
      graph: { transitiveReduction: false, cyclePrevention: false },
      // container (from = milestone/story) is the parent; feature (to) sits under it.
      positioning: { role: 'containment', containerEnd: 'from', priority: 1, emitParentRule: true },
      // fan-in advisory: at most 3 implementers per feature (was FANOUT_LIMITS.feature_implemented_by).
      validation: { maxReverseTargets: 3 },
    },
    {
      name: 'documentation',
      label: 'Documentation',
      description:
        '`documents` on a document lists the features it describes; the reverse field ' +
        '`documented_by` on the feature lists its documents. On the canvas the document sits ' +
        'under the feature it documents (the feature is the container). Advisories: a document ' +
        'should document at most 2 features, and a feature should be documented by at most 2 documents.',
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
      // fan-out/fan-in advisories (were FANOUT_LIMITS.document_documents / feature_documented_by).
      validation: { maxForwardTargets: 2, maxReverseTargets: 2 },
    },
    {
      name: 'decision-impact',
      label: 'Affects',
      description:
        '`affects` lists the entities materially changed by this decision (documents in the ' +
        'default schema); the reverse field `decided_by` is written onto affected targets — ' +
        "distinct from the decision entity's own `decided_by` person field. The decision node " +
        'sits under the document it affects. Advisory: a decision should affect at most 2 documents.',
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
      // fan-out advisory: a decision should affect at most 2 documents (was FANOUT_LIMITS.decision_affects).
      validation: { maxForwardTargets: 2 },
    },
    {
      name: 'supersession',
      label: 'Supersession',
      description:
        '`supersedes` on a decision points to the older decision it replaces; the reverse field ' +
        '`superseded_by` on the old decision points to its replacement (which should move it to ' +
        'the Superseded status). One-to-one. On the canvas the newer decision is sequenced before ' +
        'the one it supersedes.',
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
      description:
        '`previous_version` on a document points to the older revision it replaces; the reverse ' +
        'field `next_version` on the older document points forward to its successor. One-to-one ' +
        'chain of document revisions; on the canvas a document is sequenced after its previous version.',
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
