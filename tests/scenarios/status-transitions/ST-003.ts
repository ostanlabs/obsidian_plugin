import { defineScenario } from '../../framework';
import { milestone, story, task, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * ST-003: Parent Status Based on Children
 * Verifies parent status reflects children status
 */
export default defineScenario({
  id: 'ST-003',
  name: 'Parent Status Based on Children',
  category: 'status-transitions',
  description: 'Verify parent status indicator reflects aggregate children status',

  preconditions: {
    entities: [
      milestone('M-001', {
        title: 'MVP',
        workstream: 'engineering',
        status: 'In Progress',
        children: ['S-001', 'S-002'],
      }),
      story('S-001', { title: 'Auth', parent: 'M-001', status: 'Done' }),
      story('S-002', { title: 'API', parent: 'M-001', status: 'Not Started' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 In Progress, S-001 Done, S-002 Not Started',
  },

  steps: [
    command('populate-canvas', {}),
    command('update-frontmatter', {
      path: 'stories/S-002_API.md',
      frontmatter: { status: 'Done' },
    }),
  ],

  expectations: [
    // S-002 updated
    expectFrontmatter('stories/S-002_API.md', 'status', 'Done'),
    // M-001 shows progress indicator
    {
      check: 'canvas-node-progress',
      nodeId: 'M-001',
      childrenDone: 2,
      childrenTotal: 2,
      description: 'M-001 shows 2/2 children done',
    },
    // Suggestion to update parent status
    {
      check: 'notice-shown',
      type: 'info',
      message: 'All children complete',
      description: 'Notice suggests updating M-001 to Done',
    },
    // Parent status NOT auto-changed
    expectFrontmatter('milestones/M-001_MVP.md', 'status', 'In Progress'),
  ],
});

