import { defineScenario } from '../../framework';
import { milestone, story, command } from '../../framework/fixtures';

/**
 * SC-053: Navigate from Canvas to File
 * Verifies double-clicking canvas node opens file in editor
 */
export default defineScenario({
  id: 'SC-053',
  name: 'Navigate from Canvas to File',
  category: 'navigation',
  description: 'Verify double-clicking canvas node opens file in editor',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
    ],
    canvas: {
      nodes: [
        { id: 'M-001', file: 'milestones/M-001_MVP.md' },
        { id: 'S-001', file: 'stories/S-001_Auth.md' },
      ],
      edges: [],
    },
    activeView: 'canvas',
    description: 'Canvas view active with M-001 and S-001 nodes',
  },

  steps: [
    command('double-click-canvas-node', { nodeId: 'S-001' }),
  ],

  expectations: [
    {
      check: 'active-file',
      path: 'stories/S-001_Auth.md',
      description: 'S-001 is now active file',
    },
    {
      check: 'file-opened-in-editor',
      path: 'stories/S-001_Auth.md',
      description: 'S-001 opened in editor pane',
    },
    {
      check: 'canvas-still-visible',
      description: 'Canvas remains visible (split view or tab)',
    },
  ],
});

