import { defineScenario } from '../../framework';
import { story, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * EC-022: Blocks/Depends_on Mismatch
 * Verifies handling when blocks and depends_on are out of sync
 */
export default defineScenario({
  id: 'EC-022',
  name: 'Blocks/Depends_on Mismatch',
  category: 'edge-cases',
  description: 'Verify handling when blocks and depends_on arrays are inconsistent',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'stories/S-001_A.md',
        content: `---
id: S-001
type: story
title: Story A
blocks:
  - S-002
  - S-003
---
# Story A`,
      },
      {
        path: 'stories/S-002_B.md',
        content: `---
id: S-002
type: story
title: Story B
depends_on:
  - S-001
---
# Story B`,
      },
      {
        path: 'stories/S-003_C.md',
        content: `---
id: S-003
type: story
title: Story C
depends_on: []
---
# Story C`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-001 blocks [S-002, S-003], S-002 depends_on [S-001], S-003 depends_on []',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Edge based on depends_on (source of truth)
    expectCanvasEdge('S-001', 'S-002'),
    // No edge S-001→S-003 (S-003 has empty depends_on)
    {
      check: 'canvas-edge-not-exists',
      fromNode: 'S-001',
      toNode: 'S-003',
      description: 'No edge S-001→S-003 (depends_on is source of truth)',
    },
    // Warning about mismatch
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'blocks/depends_on mismatch',
      description: 'Warning about inconsistent blocks/depends_on',
    },
    // Total edges
    {
      check: 'canvas-edge-count',
      expected: 1,
      description: 'Only 1 edge (depends_on is source of truth)',
    },
  ],
});

