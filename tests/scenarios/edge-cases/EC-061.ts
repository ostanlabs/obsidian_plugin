import { defineScenario } from '../../framework';
import { command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-061: Missing Required Fields
 * Verifies handling of files missing id or type
 */
export default defineScenario({
  id: 'EC-061',
  name: 'Missing Required Fields',
  category: 'edge-cases',
  description: 'Verify handling of files missing id or type fields',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Valid.md',
        content: `---
id: M-001
type: milestone
title: Valid
workstream: engineering
---
# Valid`,
      },
      {
        path: 'milestones/NoId.md',
        content: `---
type: milestone
title: No ID
workstream: engineering
---
# No ID`,
      },
      {
        path: 'milestones/NoType.md',
        content: `---
id: M-003
title: No Type
workstream: engineering
---
# No Type`,
      },
      {
        path: 'milestones/NoBoth.md',
        content: `---
title: No ID or Type
workstream: engineering
---
# No ID or Type`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 valid, others missing id and/or type',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Valid file processed
    expectCanvasNode('M-001'),
    // Missing id skipped
    {
      check: 'canvas-node-count',
      expected: 1,
      description: 'Only 1 node (files without id skipped)',
    },
    // Warning about missing fields
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'missing required fields',
      description: 'Warning about missing fields',
    },
    {
      check: 'notice-contains',
      contains: ['NoId.md', 'NoType.md', 'NoBoth.md'],
      description: 'Warning lists files with missing fields',
    },
  ],
});

