import { defineScenario } from '../../framework';
import { milestone, story, task, command } from '../../framework/fixtures';

/**
 * EC-070: Hide All Entity Types
 * Verifies canvas is empty when all types hidden
 */
export default defineScenario({
  id: 'EC-070',
  name: 'Hide All Entity Types',
  category: 'edge-cases',
  description: 'Verify canvas shows no nodes when all entity types are hidden',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
      task('T-001', { title: 'Login', parent: 'S-001' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001, S-001, T-001 on canvas',
  },

  steps: [
    command('populate-canvas', {}),
    command('toggle-visibility', { entityType: 'milestone', visible: false }),
    command('toggle-visibility', { entityType: 'story', visible: false }),
    command('toggle-visibility', { entityType: 'task', visible: false }),
    command('toggle-visibility', { entityType: 'decision', visible: false }),
    command('toggle-visibility', { entityType: 'document', visible: false }),
    command('toggle-visibility', { entityType: 'feature', visible: false }),
  ],

  expectations: [
    // No visible nodes
    {
      check: 'visible-node-count',
      expected: 0,
      description: 'No visible nodes on canvas',
    },
    // Nodes still exist (just hidden)
    {
      check: 'canvas-node-count',
      expected: 3,
      description: 'Nodes still exist in canvas data',
    },
    // No edges visible
    {
      check: 'visible-edge-count',
      expected: 0,
      description: 'No visible edges',
    },
    // Restore visibility
    {
      check: 'after-command',
      command: { name: 'toggle-visibility', args: { entityType: 'milestone', visible: true } },
      expectations: [
        {
          check: 'visible-node-count',
          expected: 1,
          description: 'M-001 visible after restore',
        },
      ],
      description: 'Can restore visibility',
    },
  ],
});

