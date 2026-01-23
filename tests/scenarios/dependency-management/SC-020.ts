import { defineScenario } from '../../framework';
import { story, command, editFile, expectFrontmatter, expectCanvasEdge } from '../../framework/fixtures';

/**
 * SC-020: Simple Dependency Chain
 * Verifies depends_on creates edge and auto-syncs blocks field
 */
export default defineScenario({
  id: 'SC-020',
  name: 'Simple Dependency Chain',
  category: 'dependency-management',
  description: 'Verify depends_on creates edge and auto-syncs blocks field',

  preconditions: {
    entities: [
      story('S-001', { title: 'Foundation', blocks: [] }),
      story('S-002', { title: 'Feature', depends_on: [] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-001 exists with empty blocks, S-002 exists with empty depends_on',
  },

  steps: [
    editFile('stories/S-002_Feature.md', { depends_on: ['S-001'] }),
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    expectFrontmatter('stories/S-002_Feature.md', 'depends_on', ['S-001']),
    {
      check: 'frontmatter-array-contains',
      path: 'stories/S-001_Foundation.md',
      field: 'blocks',
      contains: 'S-002',
      description: 'S-001 blocks auto-synced to include S-002',
    },
    expectCanvasEdge('S-001', 'S-002'),
    {
      check: 'canvas-edge-direction',
      fromNode: 'S-001',
      toNode: 'S-002',
      fromSide: 'right',
      toSide: 'left',
      description: 'Edge direction: fromSide=right, toSide=left',
    },
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'S-002',
      description: 'S-001 LEFT of S-002 (dependency before dependent)',
    },
  ],
});

