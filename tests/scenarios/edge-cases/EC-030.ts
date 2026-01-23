import { defineScenario } from '../../framework';
import { milestone, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-030: Empty Workstream Field
 * Verifies handling when workstream is empty or missing
 */
export default defineScenario({
  id: 'EC-030',
  name: 'Empty Workstream Field',
  category: 'edge-cases',
  description: 'Verify handling when workstream is empty, null, or missing',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Empty.md',
        content: `---
id: M-001
type: milestone
title: Empty Workstream
workstream: ""
---
# Empty Workstream`,
      },
      {
        path: 'milestones/M-002_Null.md',
        content: `---
id: M-002
type: milestone
title: Null Workstream
workstream: null
---
# Null Workstream`,
      },
      {
        path: 'milestones/M-003_Missing.md',
        content: `---
id: M-003
type: milestone
title: Missing Workstream
---
# Missing Workstream`,
      },
      {
        path: 'milestones/M-004_Valid.md',
        content: `---
id: M-004
type: milestone
title: Valid Workstream
workstream: engineering
---
# Valid Workstream`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 empty workstream, M-002 null, M-003 missing, M-004 valid',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All nodes on canvas
    expectCanvasNode('M-001'),
    expectCanvasNode('M-002'),
    expectCanvasNode('M-003'),
    expectCanvasNode('M-004'),
    // M-004 in engineering lane
    {
      check: 'position-in-workstream-lane',
      nodeId: 'M-004',
      workstream: 'engineering',
      description: 'M-004 in engineering lane',
    },
    // M-001, M-002, M-003 in "unassigned" or default lane
    {
      check: 'same-workstream-lane',
      nodes: ['M-001', 'M-002', 'M-003'],
      description: 'Empty/null/missing workstreams in same lane',
    },
    // Warning about missing workstreams
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'entities without workstream',
      description: 'Warning about missing workstreams',
    },
  ],
});

