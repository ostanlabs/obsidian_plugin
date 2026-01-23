import { defineScenario } from '../../framework';
import { milestone, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-041: Duplicate Nodes on Canvas
 * Verifies handling when same entity appears twice on canvas
 */
export default defineScenario({
  id: 'EC-041',
  name: 'Duplicate Nodes on Canvas',
  category: 'edge-cases',
  description: 'Verify handling when same entity file appears twice on canvas',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
    ],
    canvas: {
      nodes: [
        { id: 'node-1', file: 'milestones/M-001_MVP.md', x: 0, y: 0 },
        { id: 'node-2', file: 'milestones/M-001_MVP.md', x: 500, y: 500 },
      ],
      edges: [],
    },
    description: 'Canvas has two nodes pointing to same M-001 file',
  },

  steps: [
    command('reposition-nodes', {}),
  ],

  expectations: [
    // Only one node after reposition
    {
      check: 'canvas-node-count-by-file',
      file: 'milestones/M-001_MVP.md',
      expected: 1,
      description: 'Only 1 node for M-001 after reposition',
    },
    // Warning about duplicate
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Duplicate node removed',
      description: 'Warning about duplicate node',
    },
    // Remaining node positioned correctly
    expectCanvasNode('M-001'),
    {
      check: 'position-in-workstream-lane',
      nodeId: 'M-001',
      workstream: 'engineering',
      description: 'M-001 in correct workstream lane',
    },
  ],
});

