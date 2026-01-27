import { defineScenario } from '../../framework';
import { milestone, story, task, command } from '../../framework/fixtures';

/**
 * SC-051: Navigate to Child
 * Verifies clicking child link in children array opens child file
 */
export default defineScenario({
  id: 'SC-051',
  name: 'Navigate to Child',
  category: 'navigation',
  description: 'Verify clicking child link in children array opens child file',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering', children: ['S-001', 'S-002'] }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
      story('S-002', { title: 'API', parent: 'M-001' }),
    ],
    canvas: { nodes: [], edges: [] },
    activeFile: 'milestones/M-001_MVP.md',
    description: 'M-001 open in editor, has children: [S-001, S-002]',
  },

  steps: [
    command('click-frontmatter-link', { field: 'children', index: 1 }),
  ],

  expectations: [
    {
      check: 'active-file',
      path: 'stories/S-002_API.md',
      description: 'S-002 (second child) is now active file',
    },
    {
      check: 'file-opened-in-editor',
      path: 'stories/S-002_API.md',
      description: 'S-002 opened in editor pane',
    },
  ],
});

