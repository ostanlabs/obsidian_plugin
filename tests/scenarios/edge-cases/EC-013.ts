import { defineScenario } from '../../framework';
import { milestone, story, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * EC-013: Children Array Out of Sync
 * Verifies handling when children array doesn't match parent references
 */
export default defineScenario({
  id: 'EC-013',
  name: 'Children Array Out of Sync',
  category: 'edge-cases',
  description: 'Verify handling when children array has extra/missing entries vs parent refs',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Parent.md',
        content: `---
id: M-001
type: milestone
title: Parent
workstream: engineering
children:
  - S-001
  - S-003
  - S-999
---
# Parent`,
      },
      {
        path: 'stories/S-001_Child1.md',
        content: `---
id: S-001
type: story
title: Child 1
parent: M-001
---
# Child 1`,
      },
      {
        path: 'stories/S-002_Child2.md',
        content: `---
id: S-002
type: story
title: Child 2
parent: M-001
---
# Child 2`,
      },
      {
        path: 'stories/S-003_Child3.md',
        content: `---
id: S-003
type: story
title: Child 3
parent: null
---
# Child 3`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 children: [S-001, S-003, S-999]. S-001 parent: M-001, S-002 parent: M-001, S-003 parent: null',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Edges based on parent field (source of truth)
    {
      check: 'canvas-edge-exists',
      fromNode: 'S-001',
      toNode: 'M-001',
      description: 'Edge S-001→M-001 (parent field)',
    },
    {
      check: 'canvas-edge-exists',
      fromNode: 'S-002',
      toNode: 'M-001',
      description: 'Edge S-002→M-001 (parent field, even though not in children)',
    },
    {
      check: 'canvas-edge-not-exists',
      fromNode: 'S-003',
      toNode: 'M-001',
      description: 'No edge S-003→M-001 (parent: null)',
    },
    // Warning about inconsistency
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Parent/children mismatch',
      description: 'Warning about inconsistent parent/children',
    },
    // S-999 not found warning
    {
      check: 'notice-contains',
      contains: 'S-999',
      description: 'Warning mentions non-existent S-999',
    },
  ],
});

