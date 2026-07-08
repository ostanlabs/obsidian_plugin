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
    // Invalid IDs still processed (lenient). This matches the REAL plugin:
    // populateCanvasFromVault (main.ts) gates only on a valid `type` and extracts
    // the id as a raw string via regex + stripQuotes — it never validates against
    // ID_PATTERNS (util/entityNavigator.ts), so '001' and 'story-one' both get
    // canvas nodes.
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
    // Note: the real plugin shows NO warning notice about non-standard ID
    // formats during populate (main.ts populateCanvasFromVault has no such
    // Notice), so no notice expectation here.
    // Total nodes
    {
      check: 'canvas-node-count',
      expected: 3,
      description: 'All 3 entities on canvas (lenient)',
    },
  ],
});

