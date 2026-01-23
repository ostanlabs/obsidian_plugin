import { defineScenario } from '../../framework';
import { story, command } from '../../framework/fixtures';

/**
 * SC-024: Circular Dependency Detection
 * Verifies circular dependencies are detected and handled gracefully
 */
export default defineScenario({
  id: 'SC-024',
  name: 'Circular Dependency Detection',
  category: 'dependency-management',
  description: 'Verify circular dependency is detected, one edge skipped, no infinite loop',

  preconditions: {
    entities: [
      story('S-001', { title: 'Story A', depends_on: ['S-003'] }),
      story('S-002', { title: 'Story B', depends_on: ['S-001'] }),
      story('S-003', { title: 'Story C', depends_on: ['S-002'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-001→S-003→S-002→S-001 circular dependency',
  },

  steps: [
    command('reposition-nodes', {}),
  ],

  expectations: [
    {
      check: 'notice-shown',
      message: 'Circular dependency detected',
      description: 'Error notice mentions circular dependency',
    },
    {
      check: 'notice-contains',
      contains: ['S-001', 'S-002', 'S-003'],
      description: 'Notice mentions all entities in cycle',
    },
    {
      check: 'canvas-edge-count',
      expected: 2,
      description: 'Only 2 of 3 edges created (one skipped)',
    },
    {
      check: 'command-completes',
      timeout: 5000,
      description: 'No infinite loop - command completes in reasonable time',
    },
    {
      check: 'all-nodes-positioned',
      nodes: ['S-001', 'S-002', 'S-003'],
      description: 'All nodes have valid X,Y (no NaN or 0,0)',
    },
    {
      check: 'log-contains',
      message: 'edge was skipped',
      description: 'Console shows which edge was skipped',
    },
  ],
});

