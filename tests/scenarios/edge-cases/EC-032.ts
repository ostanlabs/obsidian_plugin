import { defineScenario } from '../../framework';
import { milestone, command } from '../../framework/fixtures';

/**
 * EC-032: Many Workstreams (10+)
 * Verifies handling of many workstreams
 */
export default defineScenario({
  id: 'EC-032',
  name: 'Many Workstreams (10+)',
  category: 'edge-cases',
  description: 'Verify handling of 10+ workstreams with proper lane separation',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'Engineering', workstream: 'engineering' }),
      milestone('M-002', { title: 'Business', workstream: 'business' }),
      milestone('M-003', { title: 'Design', workstream: 'design' }),
      milestone('M-004', { title: 'Marketing', workstream: 'marketing' }),
      milestone('M-005', { title: 'Sales', workstream: 'sales' }),
      milestone('M-006', { title: 'Support', workstream: 'support' }),
      milestone('M-007', { title: 'Legal', workstream: 'legal' }),
      milestone('M-008', { title: 'Finance', workstream: 'finance' }),
      milestone('M-009', { title: 'HR', workstream: 'hr' }),
      milestone('M-010', { title: 'Operations', workstream: 'operations' }),
      milestone('M-011', { title: 'Research', workstream: 'research' }),
      milestone('M-012', { title: 'QA', workstream: 'qa' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: '12 milestones in 12 different workstreams',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All 12 nodes on canvas
    {
      check: 'canvas-node-count',
      expected: 12,
      description: 'All 12 nodes on canvas',
    },
    // All in different Y bands
    {
      check: 'all-different-y-bands',
      nodes: ['M-001', 'M-002', 'M-003', 'M-004', 'M-005', 'M-006', 'M-007', 'M-008', 'M-009', 'M-010', 'M-011', 'M-012'],
      description: 'All 12 milestones in different Y bands',
    },
    // No overlap
    {
      check: 'no-node-overlap',
      description: 'No nodes overlapping',
    },
    // Reasonable canvas height
    {
      check: 'canvas-bounds',
      maxHeight: 10000,
      description: 'Canvas height reasonable (not infinite)',
    },
    // Command completes
    {
      check: 'command-completes',
      timeout: 5000,
      description: 'Reposition completes in reasonable time',
    },
  ],
});

