import { defineScenario } from '../../framework';
import { command } from '../../framework/fixtures';

/**
 * EC-012: Circular Parent Reference
 * Verifies handling when parent chain forms a cycle
 */
export default defineScenario({
  id: 'EC-012',
  name: 'Circular Parent Reference',
  category: 'edge-cases',
  description: 'Verify handling when parent chain forms a cycle (A→B→C→A)',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'stories/S-001_A.md',
        content: `---
id: S-001
type: story
title: Story A
parent: S-003
---
# Story A`,
      },
      {
        path: 'stories/S-002_B.md',
        content: `---
id: S-002
type: story
title: Story B
parent: S-001
---
# Story B`,
      },
      {
        path: 'stories/S-003_C.md',
        content: `---
id: S-003
type: story
title: Story C
parent: S-002
---
# Story C`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-001→S-003→S-002→S-001 circular parent chain',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All nodes on canvas
    {
      check: 'canvas-node-count',
      expected: 3,
      description: 'All 3 nodes on canvas',
    },
    // NOTE on real plugin behavior: cycle detection/breaking only applies to
    // depends_on dependencies (main.ts populateCanvasFromVault calls
    // detectAndBreakCycles for milestone/story DEPENDENCIES). Parent edges are
    // created unconditionally for every entity with a `parent` whose target is
    // on the canvas (main.ts: "Create edge for parent relationship" —
    // `if (info.parent) { ... createEdge(sourceNodeId, parentNodeId, ...) }`),
    // with no parent-cycle warning notice. Layout depth calculation guards
    // against the cycle with a visited set, so nothing hangs — all 3 parent
    // edges are drawn.
    {
      check: 'canvas-edge-count',
      expected: 3,
      description: 'All 3 parent edges drawn (real plugin does not break parent cycles)',
    },
    // Command completes (no infinite loop)
    {
      check: 'command-completes',
      timeout: 5000,
      description: 'No infinite loop - command completes',
    },
    // All nodes have valid positions
    {
      check: 'all-nodes-positioned',
      nodes: ['S-001', 'S-002', 'S-003'],
      description: 'All nodes have valid X,Y positions',
    },
  ],
});

