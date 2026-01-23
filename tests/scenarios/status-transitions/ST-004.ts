import { defineScenario } from '../../framework';
import { story, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * ST-004: Status Change with Blocking Dependencies
 * Verifies warning when completing entity that blocks others
 */
export default defineScenario({
  id: 'ST-004',
  name: 'Status Change with Blocking Dependencies',
  category: 'status-transitions',
  description: 'Verify notification when completing entity that blocks others',

  preconditions: {
    entities: [
      story('S-001', {
        title: 'Foundation',
        status: 'In Progress',
        blocks: ['S-002', 'S-003'],
      }),
      story('S-002', { title: 'Feature A', status: 'Not Started', depends_on: ['S-001'] }),
      story('S-003', { title: 'Feature B', status: 'Not Started', depends_on: ['S-001'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-001 In Progress, blocks S-002 and S-003',
  },

  steps: [
    command('populate-canvas', {}),
    command('update-frontmatter', {
      path: 'stories/S-001_Foundation.md',
      frontmatter: { status: 'Done' },
    }),
  ],

  expectations: [
    // S-001 updated
    expectFrontmatter('stories/S-001_Foundation.md', 'status', 'Done'),
    // Notification about unblocked entities
    {
      check: 'notice-shown',
      type: 'info',
      message: 'Unblocked 2 entities',
      description: 'Notice about unblocked entities',
    },
    {
      check: 'notice-contains',
      contains: ['S-002', 'S-003'],
      description: 'Notice lists unblocked entities',
    },
    // Canvas edges updated (visual indicator)
    {
      check: 'canvas-edge-style',
      fromNode: 'S-001',
      toNode: 'S-002',
      style: 'completed-dependency',
      description: 'Edge shows completed dependency style',
    },
    // Blocked entities NOT auto-started
    expectFrontmatter('stories/S-002_Feature_A.md', 'status', 'Not Started'),
    expectFrontmatter('stories/S-003_Feature_B.md', 'status', 'Not Started'),
  ],
});

