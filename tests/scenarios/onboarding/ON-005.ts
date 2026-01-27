import { defineScenario } from '../../framework';
import { milestone, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * ON-005: Populate Canvas with First Entity
 * Verifies populate command adds entity to empty canvas
 */
export default defineScenario({
  id: 'ON-005',
  name: 'Populate Canvas with First Entity',
  category: 'onboarding',
  description: 'Verify Populate from vault adds M-001 to empty canvas',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP Release', workstream: 'engineering' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Canvas open, M-001 exists in vault, canvas is empty',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    expectCanvasNode('M-001'),
    {
      check: 'canvas-node-size',
      nodeId: 'M-001',
      width: 280,
      height: 200,
      description: 'Milestone node has correct size (280x200)',
    },
    {
      check: 'canvas-node-position-valid',
      nodeId: 'M-001',
      description: 'Node has valid position (not at 0,0)',
    },
    {
      check: 'notice-shown',
      message: 'Added 1 entity',
      description: 'Notice shows 1 entity added',
    },
  ],
});

