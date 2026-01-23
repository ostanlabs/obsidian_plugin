import { defineScenario } from '../../framework';
import { story, task, command, expectFileExists, expectFrontmatter, expectCanvasNode, expectCanvasEdge } from '../../framework/fixtures';

/**
 * SC-003: Create Task Under Story
 * Verifies task creation with parent story and estimate
 */
export default defineScenario({
  id: 'SC-003',
  name: 'Create Task Under Story',
  category: 'entity-creation',
  description: 'Verify task creation with parent story, estimate, and correct ID assignment',

  preconditions: {
    entities: [
      story('S-015', { title: 'Database Layer' }),
      // Existing tasks T-001 through T-050
      ...Array.from({ length: 50 }, (_, i) => 
        task(`T-${String(i + 1).padStart(3, '0')}`, { title: `Task ${i + 1}` })
      ),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-015 exists, existing tasks T-001 through T-050',
  },

  steps: [
    command('create-structured-item', {
      type: 'task',
      title: 'Setup Database',
      parent: 'S-015',
      estimate_hrs: 4,
    }),
  ],

  expectations: [
    expectFileExists('tasks/T-051_Setup_Database.md'),
    expectFrontmatter('tasks/T-051_Setup_Database.md', 'id', 'T-051'),
    expectFrontmatter('tasks/T-051_Setup_Database.md', 'parent', 'S-015'),
    expectFrontmatter('tasks/T-051_Setup_Database.md', 'estimate_hrs', 4),
    {
      check: 'frontmatter-array-contains',
      path: 'stories/S-015_Database_Layer.md',
      field: 'children',
      contains: 'T-051',
      description: 'S-015 children array includes T-051',
    },
    expectCanvasNode('T-051'),
    expectCanvasEdge('T-051', 'S-015'),
    {
      check: 'canvas-node-size',
      nodeId: 'T-051',
      width: 160,
      height: 100,
      description: 'Task node has correct size (160x100)',
    },
    {
      check: 'position-left-of',
      leftNode: 'T-051',
      rightNode: 'S-015',
      description: 'T-051 positioned LEFT of S-015',
    },
  ],
});

