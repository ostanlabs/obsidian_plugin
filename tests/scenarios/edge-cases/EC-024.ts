import { defineScenario } from '../../framework';
import { story, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * EC-024: Diamond Dependency Pattern
 * Verifies handling of diamond-shaped dependency graph
 */
export default defineScenario({
  id: 'EC-024',
  name: 'Diamond Dependency Pattern',
  category: 'edge-cases',
  description: 'Verify handling of diamond dependency: A→B, A→C, B→D, C→D',

  preconditions: {
    entities: [
      story('S-001', { title: 'Root' }),
      story('S-002', { title: 'Left Branch', depends_on: ['S-001'] }),
      story('S-003', { title: 'Right Branch', depends_on: ['S-001'] }),
      story('S-004', { title: 'Merge Point', depends_on: ['S-002', 'S-003'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Diamond: S-001→S-002→S-004, S-001→S-003→S-004',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All 4 edges
    expectCanvasEdge('S-001', 'S-002'),
    expectCanvasEdge('S-001', 'S-003'),
    expectCanvasEdge('S-002', 'S-004'),
    expectCanvasEdge('S-003', 'S-004'),
    {
      check: 'canvas-edge-count',
      expected: 4,
      description: '4 edges in diamond',
    },
    // X ordering: S-001 < S-002,S-003 < S-004
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'S-002',
      description: 'S-001 LEFT of S-002',
    },
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'S-003',
      description: 'S-001 LEFT of S-003',
    },
    {
      check: 'position-left-of',
      leftNode: 'S-002',
      rightNode: 'S-004',
      description: 'S-002 LEFT of S-004',
    },
    // S-002 and S-003 at similar X (parallel branches)
    {
      check: 'similar-x-position',
      nodes: ['S-002', 'S-003'],
      tolerance: 50,
      description: 'S-002 and S-003 at similar X (parallel)',
    },
    // No overlap
    {
      check: 'no-node-overlap',
      description: 'No nodes overlapping',
    },
  ],
});

