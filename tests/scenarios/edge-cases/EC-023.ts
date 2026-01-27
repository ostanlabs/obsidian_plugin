import { defineScenario } from '../../framework';
import { story, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * EC-023: Deep Dependency Chain
 * Verifies handling of very long dependency chains
 */
export default defineScenario({
  id: 'EC-023',
  name: 'Deep Dependency Chain',
  category: 'edge-cases',
  description: 'Verify handling of 20+ level deep dependency chain',

  preconditions: {
    entities: [
      // Create chain: S-001 → S-002 → S-003 → ... → S-020
      ...Array.from({ length: 20 }, (_, i) => {
        const id = `S-${String(i + 1).padStart(3, '0')}`;
        const depends_on = i > 0 ? [`S-${String(i).padStart(3, '0')}`] : [];
        return story(id, { title: `Story ${i + 1}`, depends_on });
      }),
    ],
    canvas: { nodes: [], edges: [] },
    description: '20 stories in linear dependency chain',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All 20 nodes on canvas
    {
      check: 'canvas-node-count',
      expected: 20,
      description: 'All 20 nodes on canvas',
    },
    // All 19 edges exist
    {
      check: 'canvas-edge-count',
      expected: 19,
      description: '19 edges (chain of 20)',
    },
    // First and last edges
    expectCanvasEdge('S-001', 'S-002'),
    expectCanvasEdge('S-019', 'S-020'),
    // Correct X ordering
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'S-020',
      description: 'S-001 far LEFT of S-020',
    },
    // Command completes in reasonable time
    {
      check: 'command-completes',
      timeout: 10000,
      description: 'Reposition completes within 10 seconds',
    },
    // No overlap
    {
      check: 'no-node-overlap',
      description: 'No nodes overlapping',
    },
  ],
});

