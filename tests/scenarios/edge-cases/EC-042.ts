import { defineScenario } from '../../framework';
import { milestone, command } from '../../framework/fixtures';

/**
 * EC-042: Non-Entity Nodes on Canvas
 * Verifies non-entity nodes (text, images) are preserved
 */
export default defineScenario({
  id: 'EC-042',
  name: 'Non-Entity Nodes on Canvas',
  category: 'edge-cases',
  description: 'Verify non-entity nodes (text, images, groups) are preserved during reposition',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
    ],
    canvas: {
      nodes: [
        { id: 'M-001', type: 'file', file: 'milestones/M-001_MVP.md', x: 0, y: 0 },
        { id: 'text-1', type: 'text', text: 'Important Note', x: 100, y: 100 },
        { id: 'group-1', type: 'group', label: 'Sprint 1', x: 200, y: 200, width: 400, height: 300 },
        { id: 'link-1', type: 'link', url: 'https://example.com', x: 300, y: 300 },
      ],
      edges: [],
    },
    description: 'Canvas has M-001 file node plus text, group, and link nodes',
  },

  steps: [
    command('reposition-nodes', {}),
  ],

  expectations: [
    // Entity node repositioned
    {
      check: 'canvas-node-moved',
      nodeId: 'M-001',
      description: 'M-001 was repositioned',
    },
    // Non-entity nodes preserved
    {
      check: 'canvas-node-exists',
      nodeId: 'text-1',
      description: 'Text node preserved',
    },
    {
      check: 'canvas-node-exists',
      nodeId: 'group-1',
      description: 'Group node preserved',
    },
    {
      check: 'canvas-node-exists',
      nodeId: 'link-1',
      description: 'Link node preserved',
    },
    // Non-entity nodes NOT moved
    {
      check: 'canvas-node-position',
      nodeId: 'text-1',
      x: 100,
      y: 100,
      description: 'Text node position unchanged',
    },
    {
      check: 'canvas-node-position',
      nodeId: 'group-1',
      x: 200,
      y: 200,
      description: 'Group node position unchanged',
    },
    // Total node count
    {
      check: 'canvas-node-count',
      expected: 4,
      description: 'All 4 nodes still on canvas',
    },
  ],
});

