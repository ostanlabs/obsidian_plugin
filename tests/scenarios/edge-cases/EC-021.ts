import { defineScenario } from '../../framework';
import { story, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-021: Missing Dependency Reference
 * Verifies handling when depends_on references non-existent entity
 */
export default defineScenario({
  id: 'EC-021',
  name: 'Missing Dependency Reference',
  category: 'edge-cases',
  description: 'Verify handling when depends_on references non-existent entity',

  preconditions: {
    entities: [
      story('S-001', { title: 'Story', depends_on: ['S-999', 'S-998'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-001 depends on S-999 and S-998, neither exists',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // S-001 on canvas
    expectCanvasNode('S-001'),
    // No edges (dependencies don't exist)
    {
      check: 'canvas-edge-count',
      expected: 0,
      description: 'No edges (dependencies not found)',
    },
    // Warning shown
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Missing dependencies',
      description: 'Warning about missing dependency references',
    },
    {
      check: 'notice-contains',
      contains: ['S-999', 'S-998'],
      description: 'Warning lists missing IDs',
    },
    // Frontmatter unchanged
    {
      check: 'frontmatter-array-equals',
      path: 'stories/S-001_Story.md',
      field: 'depends_on',
      expected: ['S-999', 'S-998'],
      description: 'depends_on field preserved',
    },
  ],
});

