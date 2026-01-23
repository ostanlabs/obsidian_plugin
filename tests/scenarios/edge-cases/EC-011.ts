import { defineScenario } from '../../framework';
import { milestone, story, command, expectCanvasNode, expectCanvasEdge } from '../../framework/fixtures';

/**
 * EC-011: Orphan Handling After Parent Deletion
 * Verifies children become orphans when parent is deleted
 */
export default defineScenario({
  id: 'EC-011',
  name: 'Orphan Handling After Parent Deletion',
  category: 'edge-cases',
  description: 'Verify children become orphans when parent file is deleted',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'Parent', workstream: 'engineering', children: ['S-001', 'S-002'] }),
      story('S-001', { title: 'Child 1', parent: 'M-001' }),
      story('S-002', { title: 'Child 2', parent: 'M-001' }),
    ],
    canvas: {
      nodes: [
        { id: 'M-001', file: 'milestones/M-001_Parent.md' },
        { id: 'S-001', file: 'stories/S-001_Child_1.md' },
        { id: 'S-002', file: 'stories/S-002_Child_2.md' },
      ],
      edges: [
        { fromNode: 'S-001', toNode: 'M-001' },
        { fromNode: 'S-002', toNode: 'M-001' },
      ],
    },
    description: 'M-001 with children S-001, S-002 on canvas with edges',
  },

  steps: [
    command('delete-file', { path: 'milestones/M-001_Parent.md' }),
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // M-001 removed from canvas
    {
      check: 'canvas-node-not-exists',
      nodeId: 'M-001',
      description: 'M-001 node removed from canvas',
    },
    // Children still on canvas
    expectCanvasNode('S-001'),
    expectCanvasNode('S-002'),
    // Edges removed
    {
      check: 'canvas-edge-not-exists',
      fromNode: 'S-001',
      toNode: 'M-001',
      description: 'Edge S-001→M-001 removed',
    },
    // Children in orphan grid
    {
      check: 'position-in-orphan-grid',
      nodeId: 'S-001',
      description: 'S-001 moved to orphan area',
    },
    {
      check: 'position-in-orphan-grid',
      nodeId: 'S-002',
      description: 'S-002 moved to orphan area',
    },
    // Warning
    {
      check: 'notice-shown',
      type: 'warning',
      message: '2 orphaned entities',
      description: 'Warning about orphaned entities',
    },
  ],
});

