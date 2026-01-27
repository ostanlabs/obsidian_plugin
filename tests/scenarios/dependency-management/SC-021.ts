import { defineScenario } from '../../framework';
import { milestone, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * SC-021: Cross-Workstream Dependency
 * Verifies dependencies across workstreams maintain correct positioning
 */
export default defineScenario({
  id: 'SC-021',
  name: 'Cross-Workstream Dependency',
  category: 'dependency-management',
  description: 'Verify cross-workstream dependency maintains X ordering across Y lanes',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'Backend MVP', workstream: 'engineering' }),
      milestone('M-002', { title: 'Launch Campaign', workstream: 'business', depends_on: ['M-001'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 in engineering, M-002 in business depends on M-001',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // Different Y bands (workstream lanes)
    {
      check: 'different-workstream-lanes',
      nodes: ['M-001', 'M-002'],
      description: 'M-001 in engineering lane, M-002 in business lane (different Y)',
    },
    
    // X ordering maintained
    {
      check: 'position-left-of',
      leftNode: 'M-001',
      rightNode: 'M-002',
      description: 'M-001 LEFT of M-002 despite different workstreams',
    },
    
    // Edge spans lanes
    expectCanvasEdge('M-001', 'M-002'),
    {
      check: 'edge-crosses-workstream-lanes',
      fromNode: 'M-001',
      toNode: 'M-002',
      description: 'Edge visually crosses between workstream lanes',
    },
  ],
});

