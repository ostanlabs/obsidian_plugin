import { defineScenario } from '../../framework';
import { milestone, story, task, command } from '../../framework/fixtures';

/**
 * SC-050: Navigate to Parent
 * Verifies clicking parent link opens parent file
 */
export default defineScenario({
  id: 'SC-050',
  name: 'Navigate to Parent',
  category: 'navigation',
  description: 'Verify clicking parent link in frontmatter opens parent file',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
      task('T-001', { title: 'Login', parent: 'S-001' }),
    ],
    canvas: { nodes: [], edges: [] },
    activeFile: 'tasks/T-001_Login.md',
    description: 'T-001 open in editor, has parent: S-001',
  },

  steps: [
    command('click-frontmatter-link', { field: 'parent' }),
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
  ],
});

