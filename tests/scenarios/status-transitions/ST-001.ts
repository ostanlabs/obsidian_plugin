import { defineScenario } from '../../framework';
import { milestone, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * ST-001: Valid Status Transition
 * Verifies valid status transitions are allowed
 */
export default defineScenario({
  id: 'ST-001',
  name: 'Valid Status Transition',
  category: 'status-transitions',
  description: 'Verify valid status transitions: Not Started → In Progress → Done',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering', status: 'Not Started' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 with status Not Started',
  },

  steps: [
    command('update-frontmatter', {
      path: 'milestones/M-001_MVP.md',
      frontmatter: { status: 'In Progress' },
    }),
    command('update-frontmatter', {
      path: 'milestones/M-001_MVP.md',
      frontmatter: { status: 'Done' },
    }),
  ],

  expectations: [
    // Final status is Done
    expectFrontmatter('milestones/M-001_MVP.md', 'status', 'Done'),
    // No warnings
    {
      check: 'no-warning-about',
      message: 'invalid status',
      description: 'No warning about invalid status transition',
    },
    // Canvas node updated
    {
      check: 'canvas-node-status',
      nodeId: 'M-001',
      status: 'Done',
      description: 'Canvas node shows Done status',
    },
  ],
});

