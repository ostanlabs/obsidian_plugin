import { defineScenario } from '../../framework';
import { milestone, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-040: Empty Canvas
 * Verifies commands work on empty canvas
 */
export default defineScenario({
  id: 'EC-040',
  name: 'Empty Canvas',
  category: 'edge-cases',
  description: 'Verify commands work correctly on empty canvas',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Canvas is empty, M-001 exists in vault',
  },

  steps: [
    command('reposition-nodes', {}),
    command('populate-canvas', {}),
  ],

  expectations: [
    // Reposition on empty canvas doesn't error
    {
      check: 'no-error-notice',
      description: 'Reposition on empty canvas completes without error',
    },
    // Populate adds node
    expectCanvasNode('M-001'),
    // Notice
    {
      check: 'notice-shown',
      message: 'Added 1 entity',
      description: 'Populate notice shows 1 entity added',
    },
  ],
});

