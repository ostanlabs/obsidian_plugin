import { defineScenario } from '../../framework';
import { milestone, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-001: Duplicate Entity IDs
 * Verifies handling when two files have same ID
 */
export default defineScenario({
  id: 'EC-001',
  name: 'Duplicate Entity IDs',
  category: 'edge-cases',
  description: 'Verify handling when two files have same ID - first wins, warning shown',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_First.md',
        content: `---
id: M-001
type: milestone
title: First Milestone
workstream: engineering
---
# First Milestone`,
      },
      {
        path: 'milestones/M-001_Second.md',
        content: `---
id: M-001
type: milestone
title: Second Milestone
workstream: engineering
---
# Second Milestone`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Two files both have id: M-001',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Only one node on canvas
    {
      check: 'canvas-node-count',
      expected: 1,
      description: 'Only 1 node on canvas (not 2)',
    },
    expectCanvasNode('M-001'),
    // Warning shown
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Duplicate ID: M-001',
      description: 'Warning notice about duplicate ID',
    },
    // First file wins (alphabetically)
    {
      check: 'canvas-node-file',
      nodeId: 'M-001',
      file: 'milestones/M-001_First.md',
      description: 'First file (alphabetically) used for node',
    },
    // Console log
    {
      check: 'log-contains',
      message: 'Skipping duplicate ID M-001',
      description: 'Console shows which file was skipped',
    },
  ],
});

