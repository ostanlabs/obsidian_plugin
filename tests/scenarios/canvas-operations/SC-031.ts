import { defineScenario } from '../../framework';
import { milestone, story, task, command } from '../../framework/fixtures';

/**
 * SC-031: Reposition All Nodes
 * Verifies reposition creates proper workstream lanes and dependency ordering
 */
export default defineScenario({
  id: 'SC-031',
  name: 'Reposition All Nodes',
  category: 'canvas-operations',
  description: 'Verify reposition creates workstream lanes with correct dependency ordering',

  preconditions: {
    entities: [
      // Engineering workstream
      milestone('M-001', { title: 'Backend', workstream: 'engineering' }),
      milestone('M-002', { title: 'API', workstream: 'engineering', depends_on: ['M-001'] }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
      task('T-001', { title: 'Login', parent: 'S-001' }),
      // Business workstream
      milestone('M-003', { title: 'Launch', workstream: 'business' }),
      milestone('M-004', { title: 'Marketing', workstream: 'business', depends_on: ['M-003'] }),
      story('S-002', { title: 'Campaign', parent: 'M-003' }),
      // Cross-workstream dependency
      milestone('M-005', { title: 'Integration', workstream: 'business', depends_on: ['M-002'] }),
    ],
    canvas: {
      nodes: [
        // Random positions
        { id: 'M-001', x: 500, y: 100 },
        { id: 'M-002', x: 100, y: 500 },
        { id: 'S-001', x: 800, y: 200 },
        { id: 'T-001', x: 200, y: 800 },
        { id: 'M-003', x: 600, y: 300 },
        { id: 'M-004', x: 300, y: 600 },
        { id: 'S-002', x: 700, y: 400 },
        { id: 'M-005', x: 400, y: 700 },
      ],
      edges: [],
    },
    description: '10 nodes in random positions, 2 workstreams with dependencies',
  },

  steps: [
    command('reposition-nodes', {}),
  ],

  expectations: [
    // Workstream lanes
    {
      check: 'workstream-lane-exists',
      workstream: 'engineering',
      description: 'Engineering workstream lane visible',
    },
    {
      check: 'workstream-lane-exists',
      workstream: 'business',
      description: 'Business workstream lane visible',
    },
    // Same Y band within workstream
    {
      check: 'same-workstream-lane',
      nodes: ['M-001', 'M-002', 'S-001', 'T-001'],
      description: 'All engineering entities in same Y band',
    },
    {
      check: 'same-workstream-lane',
      nodes: ['M-003', 'M-004', 'S-002', 'M-005'],
      description: 'All business entities in same Y band',
    },
    // Dependency ordering
    {
      check: 'position-left-of',
      leftNode: 'M-001',
      rightNode: 'M-002',
      description: 'M-001 LEFT of M-002 (dependency)',
    },
    // Children positioning
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'M-001',
      description: 'Children LEFT of parents',
    },
    // No overlap
    {
      check: 'no-node-overlap',
      description: 'No nodes intersecting',
    },
  ],
});

