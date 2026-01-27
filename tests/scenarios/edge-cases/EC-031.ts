import { defineScenario } from '../../framework';
import { milestone, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-031: Single Entity in Workstream
 * Verifies workstream lane is created for single entity
 */
export default defineScenario({
  id: 'EC-031',
  name: 'Single Entity in Workstream',
  category: 'edge-cases',
  description: 'Verify workstream lane is created even for single entity',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'Engineering', workstream: 'engineering' }),
      milestone('M-002', { title: 'Business', workstream: 'business' }),
      milestone('M-003', { title: 'Design', workstream: 'design' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'One milestone per workstream (3 workstreams, 1 entity each)',
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
    // Each in different Y band
    {
      check: 'different-workstream-lanes',
      nodes: ['M-001', 'M-002', 'M-003'],
      description: 'Each milestone in different Y band',
    },
    // Workstream labels visible
    {
      check: 'workstream-label-visible',
      workstream: 'engineering',
      description: 'Engineering label visible',
    },
    {
      check: 'workstream-label-visible',
      workstream: 'business',
      description: 'Business label visible',
    },
    {
      check: 'workstream-label-visible',
      workstream: 'design',
      description: 'Design label visible',
    },
  ],
});

