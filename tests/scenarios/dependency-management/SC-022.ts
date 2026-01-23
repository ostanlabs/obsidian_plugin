import { defineScenario } from '../../framework';
import { decision, story, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * SC-022: Decision Blocking Work
 * Verifies pending decision blocks dependent story
 */
export default defineScenario({
  id: 'SC-022',
  name: 'Decision Blocking Work',
  category: 'dependency-management',
  description: 'Verify pending decision blocks dependent story with correct positioning',

  preconditions: {
    entities: [
      decision('DEC-001', { title: 'Tech Stack Choice', status: 'Pending' }),
      story('S-015', { title: 'Implementation', depends_on: ['DEC-001'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'DEC-001 pending, S-015 depends on DEC-001',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    expectCanvasEdge('DEC-001', 'S-015'),
    {
      check: 'position-left-of',
      leftNode: 'DEC-001',
      rightNode: 'S-015',
      description: 'DEC-001 LEFT of S-015',
    },
    {
      check: 'canvas-node-status',
      nodeId: 'DEC-001',
      status: 'Pending',
      description: 'DEC-001 shows Pending status',
    },
    {
      check: 'blocked-indicator',
      nodeId: 'S-015',
      blockedBy: 'DEC-001',
      description: 'S-015 shows blocked state (if implemented)',
    },
  ],
});

