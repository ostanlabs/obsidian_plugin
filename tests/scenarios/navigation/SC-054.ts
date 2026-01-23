import { defineScenario } from '../../framework';
import { milestone, story, command } from '../../framework/fixtures';

/**
 * SC-054: Navigate from File to Canvas Node
 * Verifies reveal-in-canvas command highlights node on canvas
 */
export default defineScenario({
  id: 'SC-054',
  name: 'Navigate from File to Canvas Node',
  category: 'navigation',
  description: 'Verify reveal-in-canvas command highlights and centers node on canvas',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
    ],
    canvas: {
      nodes: [
        { id: 'M-001', file: 'milestones/M-001_MVP.md', x: 0, y: 0 },
        { id: 'S-001', file: 'stories/S-001_Auth.md', x: 2000, y: 2000 },
      ],
      edges: [],
    },
    activeFile: 'stories/S-001_Auth.md',
    description: 'S-001 open in editor, S-001 node far from viewport center',
  },

  steps: [
    command('reveal-in-canvas', {}),
  ],

  expectations: [
    {
      check: 'canvas-view-active',
      description: 'Canvas view is now active',
    },
    {
      check: 'canvas-node-selected',
      nodeId: 'S-001',
      description: 'S-001 node is selected',
    },
    {
      check: 'canvas-node-in-viewport',
      nodeId: 'S-001',
      description: 'S-001 node is visible in viewport (canvas scrolled/zoomed)',
    },
    {
      check: 'canvas-node-highlighted',
      nodeId: 'S-001',
      description: 'S-001 node has highlight effect',
    },
  ],
});

