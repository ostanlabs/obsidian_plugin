import { defineScenario } from '../../framework';
import { story, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-010: Missing Parent Reference
 * Verifies handling when parent ID doesn't exist
 */
export default defineScenario({
  id: 'EC-010',
  name: 'Missing Parent Reference',
  category: 'edge-cases',
  description: 'Verify handling when parent ID references non-existent entity',

  preconditions: {
    entities: [
      story('S-001', { title: 'Orphan Story', parent: 'M-999' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-001 has parent: M-999, but M-999 does not exist',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // S-001 on canvas
    expectCanvasNode('S-001'),
    // No edge (parent doesn't exist)
    {
      check: 'canvas-edge-count',
      expected: 0,
      description: 'No edges (parent M-999 not found)',
    },
    // Warning shown
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Missing parent: M-999',
      description: 'Warning about missing parent reference',
    },
    // Positioned in orphan grid
    {
      check: 'position-in-orphan-grid',
      nodeId: 'S-001',
      description: 'S-001 in orphan area (parent not found)',
    },
    // Frontmatter unchanged
    {
      check: 'frontmatter-value',
      path: 'stories/S-001_Orphan_Story.md',
      field: 'parent',
      expected: 'M-999',
      description: 'parent field preserved (not cleared)',
    },
  ],
});

