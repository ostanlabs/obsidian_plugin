import { defineScenario } from '../../framework';
import { command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-002: Invalid ID Format
 * Verifies handling of IDs that don't match expected format
 */
export default defineScenario({
  id: 'EC-002',
  name: 'Invalid ID Format',
  category: 'edge-cases',
  description: 'Verify handling of IDs that do not match expected format (e.g., no prefix)',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/invalid_id.md',
        content: `---
id: 001
type: milestone
title: Invalid ID Milestone
workstream: engineering
---
# Invalid ID Milestone`,
      },
      {
        path: 'stories/another_invalid.md',
        content: `---
id: story-one
type: story
title: Another Invalid
---
# Another Invalid`,
      },
      {
        path: 'milestones/M-001_Valid.md',
        content: `---
id: M-001
type: milestone
title: Valid Milestone
workstream: engineering
---
# Valid Milestone`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Files with invalid IDs (001, story-one) and one valid (M-001)',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Valid ID on canvas
    expectCanvasNode('M-001'),
    // Invalid IDs still processed (lenient)
    {
      check: 'canvas-node-exists',
      nodeId: '001',
      description: 'Invalid ID 001 still added to canvas (lenient mode)',
    },
    {
      check: 'canvas-node-exists',
      nodeId: 'story-one',
      description: 'Invalid ID story-one still added to canvas',
    },
    // Warning shown
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Non-standard ID format',
      description: 'Warning about non-standard ID formats',
    },
    // Total nodes
    {
      check: 'canvas-node-count',
      expected: 3,
      description: 'All 3 entities on canvas (lenient)',
    },
  ],
});

