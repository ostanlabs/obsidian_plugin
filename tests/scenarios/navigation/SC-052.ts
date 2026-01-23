import { defineScenario } from '../../framework';
import { story, command } from '../../framework/fixtures';

/**
 * SC-052: Navigate to Dependency
 * Verifies clicking depends_on link opens dependency file
 */
export default defineScenario({
  id: 'SC-052',
  name: 'Navigate to Dependency',
  category: 'navigation',
  description: 'Verify clicking depends_on link opens dependency file',

  preconditions: {
    entities: [
      story('S-001', { title: 'Foundation' }),
      story('S-002', { title: 'Feature', depends_on: ['S-001'] }),
    ],
    canvas: { nodes: [], edges: [] },
    activeFile: 'stories/S-002_Feature.md',
    description: 'S-002 open in editor, has depends_on: [S-001]',
  },

  steps: [
    command('click-frontmatter-link', { field: 'depends_on', index: 0 }),
  ],

  expectations: [
    {
      check: 'active-file',
      path: 'stories/S-001_Foundation.md',
      description: 'S-001 is now active file',
    },
    {
      check: 'file-opened-in-editor',
      path: 'stories/S-001_Foundation.md',
      description: 'S-001 opened in editor pane',
    },
  ],
});

