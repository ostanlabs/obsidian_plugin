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
    // REAL plugin behavior (main.ts populateCanvasFromVault): inclusion is gated
    // ONLY on a recognized `type` (`if (!typeMatch) continue;` /
    // `if (!entityTypes.includes(entityType)) continue;`). A missing `id` does
    // NOT skip the file — createNode is called for every collected entity, id is
    // optional metadata. So NoId.md (type: milestone) IS added, while NoType.md
    // and NoBoth.md (no type) are skipped → 2 nodes total.
    {
      check: 'canvas-node-count',
      expected: 2,
      description: '2 nodes: M-001 + NoId.md (type gates inclusion, id does not)',
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

