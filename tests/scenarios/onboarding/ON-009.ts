import { defineScenario } from '../../framework';
import { command, expectFileExists, expectCanvasNode } from '../../framework/fixtures';

/**
 * ON-009: Import Existing Project (Migration)
 * Verifies migration of existing markdown files into project structure
 */
export default defineScenario({
  id: 'ON-009',
  name: 'Import Existing Project (Migration)',
  category: 'onboarding',
  description: 'Verify existing markdown files can be migrated into project structure',

  preconditions: {
    entities: [],
    canvas: null,
    files: [
      {
        path: 'old-project/milestone1.md',
        content: '# Milestone 1\nSome content',
      },
    ],
    description: 'Vault has existing markdown files not in expected folder structure',
  },

  steps: [
    command('initialize-project-structure', {}),
    // Manual step: move files to appropriate folders
    command('move-file', { from: 'old-project/milestone1.md', to: 'milestones/M-001_Milestone1.md' }),
    // Manual step: add frontmatter
    command('update-frontmatter', {
      path: 'milestones/M-001_Milestone1.md',
      frontmatter: { id: 'M-001', type: 'milestone', title: 'Milestone 1', workstream: 'engineering' },
    }),
    command('populate-canvas', {}),
  ],

  expectations: [
    expectFileExists('milestones/M-001_Milestone1.md'),
    expectCanvasNode('M-001'),
    {
      check: 'file-content-preserved',
      path: 'milestones/M-001_Milestone1.md',
      contains: 'Some content',
      description: 'Original content preserved after migration',
    },
  ],
});

