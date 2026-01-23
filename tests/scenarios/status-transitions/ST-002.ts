import { defineScenario } from '../../framework';
import { milestone, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * ST-002: Invalid Status Value
 * Verifies handling of invalid status values
 */
export default defineScenario({
  id: 'ST-002',
  name: 'Invalid Status Value',
  category: 'status-transitions',
  description: 'Verify handling of invalid status values (typos, unknown values)',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering', status: 'Not Started' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 with valid status Not Started',
  },

  steps: [
    command('update-frontmatter', {
      path: 'milestones/M-001_MVP.md',
      frontmatter: { status: 'InProgress' }, // Missing space - typo
    }),
  ],

  expectations: [
    // Status updated (lenient mode)
    expectFrontmatter('milestones/M-001_MVP.md', 'status', 'InProgress'),
    // Warning about non-standard value
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Non-standard status value',
      description: 'Warning about non-standard status',
    },
    {
      check: 'notice-contains',
      contains: ['InProgress', 'In Progress'],
      description: 'Warning suggests correct value',
    },
    // Canvas still works
    {
      check: 'canvas-node-exists',
      nodeId: 'M-001',
      description: 'M-001 still on canvas',
    },
  ],
});

