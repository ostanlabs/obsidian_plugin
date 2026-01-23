import { defineScenario } from '../../framework';
import { milestone, story, task, command } from '../../framework/fixtures';

/**
 * WS-001: Single Workstream Layout
 * Verifies layout with only one workstream
 */
export default defineScenario({
  id: 'WS-001',
  name: 'Single Workstream Layout',
  category: 'workstream',
  description: 'Verify layout with only one workstream uses full canvas height',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
      milestone('M-002', { title: 'Launch', workstream: 'engineering', depends_on: ['M-001'] }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
      story('S-002', { title: 'API', parent: 'M-001' }),
      story('S-003', { title: 'Docs', parent: 'M-002' }),
      task('T-001', { title: 'Login', parent: 'S-001' }),
      task('T-002', { title: 'Signup', parent: 'S-001' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'All entities in engineering workstream',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All nodes in same Y band
    {
      check: 'same-workstream-lane',
      nodes: ['M-001', 'M-002', 'S-001', 'S-002', 'S-003', 'T-001', 'T-002'],
      description: 'All nodes in same workstream lane',
    },
    // Single workstream label
    {
      check: 'workstream-label-count',
      expected: 1,
      description: 'Only 1 workstream label',
    },
    {
      check: 'workstream-label-visible',
      workstream: 'engineering',
      description: 'Engineering label visible',
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
      description: 'No nodes overlapping',
    },
  ],
});

