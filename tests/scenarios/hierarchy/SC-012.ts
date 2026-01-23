import { defineScenario } from '../../framework';
import { milestone, story, task, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * SC-012: Nested Hierarchy (Milestone → Story → Task)
 * Verifies correct positioning of nested hierarchy
 */
export default defineScenario({
  id: 'SC-012',
  name: 'Nested Hierarchy (Milestone → Story → Task)',
  category: 'hierarchy',
  description: 'Verify T-001 LEFT of S-001 LEFT of M-001 with correct edges',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering', children: ['S-001'] }),
      story('S-001', { title: 'User Auth', parent: 'M-001', children: ['T-001'] }),
      task('T-001', { title: 'Setup DB', parent: 'S-001' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 with child S-001, S-001 with child T-001',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // Position order: T-001 < S-001 < M-001 (X coordinates)
    {
      check: 'position-left-of',
      leftNode: 'T-001',
      rightNode: 'S-001',
      description: 'T-001 has smallest X position (leftmost)',
    },
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'M-001',
      description: 'S-001 between T-001 and M-001',
    },
    
    // Edges
    expectCanvasEdge('T-001', 'S-001'),
    expectCanvasEdge('S-001', 'M-001'),
    
    // Same workstream lane (similar Y positions)
    {
      check: 'same-workstream-lane',
      nodes: ['M-001', 'S-001', 'T-001'],
      description: 'All nodes in same workstream lane (similar Y)',
    },
  ],
});

