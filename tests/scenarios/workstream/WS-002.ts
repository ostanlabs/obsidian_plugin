import { defineScenario } from '../../framework';
import { milestone, story, command } from '../../framework/fixtures';

/**
 * WS-002: Multiple Workstream Layout
 * Verifies layout with multiple workstreams creates separate lanes
 */
export default defineScenario({
  id: 'WS-002',
  name: 'Multiple Workstream Layout',
  category: 'workstream',
  description: 'Verify layout with multiple workstreams creates separate horizontal lanes',

  preconditions: {
    entities: [
      // Engineering workstream
      milestone('M-001', { title: 'Backend', workstream: 'engineering' }),
      story('S-001', { title: 'API', parent: 'M-001' }),
      // Business workstream
      milestone('M-002', { title: 'Launch', workstream: 'business' }),
      story('S-002', { title: 'Marketing', parent: 'M-002' }),
      // Design workstream
      milestone('M-003', { title: 'UI', workstream: 'design' }),
      story('S-003', { title: 'Components', parent: 'M-003' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: '3 workstreams: engineering, business, design',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // 3 workstream labels
    {
      check: 'workstream-label-count',
      expected: 3,
      description: '3 workstream labels',
    },
    // Each workstream in different Y band
    {
      check: 'different-workstream-lanes',
      nodes: ['M-001', 'M-002', 'M-003'],
      description: 'Milestones in different Y bands',
    },
    // Children in same lane as parent
    {
      check: 'same-workstream-lane',
      nodes: ['M-001', 'S-001'],
      description: 'S-001 in same lane as M-001',
    },
    {
      check: 'same-workstream-lane',
      nodes: ['M-002', 'S-002'],
      description: 'S-002 in same lane as M-002',
    },
    {
      check: 'same-workstream-lane',
      nodes: ['M-003', 'S-003'],
      description: 'S-003 in same lane as M-003',
    },
    // Workstream order (alphabetical or configured)
    {
      check: 'workstream-order',
      order: ['business', 'design', 'engineering'],
      description: 'Workstreams ordered alphabetically',
    },
    // No overlap
    {
      check: 'no-node-overlap',
      description: 'No nodes overlapping',
    },
  ],
});

