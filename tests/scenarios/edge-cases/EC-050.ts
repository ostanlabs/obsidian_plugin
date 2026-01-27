import { defineScenario } from '../../framework';
import { milestone, command, expectFileExists } from '../../framework/fixtures';

/**
 * EC-050: Archive Folder Doesn't Exist
 * Verifies archive folder is created when first entity is archived
 */
export default defineScenario({
  id: 'EC-050',
  name: 'Archive Folder Does Not Exist',
  category: 'edge-cases',
  description: 'Verify archive folder is created when first entity is archived',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'To Archive', workstream: 'engineering', archived: true }),
    ],
    // Note: archive folder intentionally NOT created - test verifies it gets created
    canvas: { nodes: [], edges: [] },
    description: 'M-001 has archived: true, archive folder does not exist',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Archive folder created
    expectFileExists('archive/.gitkeep'),
    expectFileExists('archive/milestones/.gitkeep'),
    // File moved
    expectFileExists('archive/milestones/M-001_To_Archive.md'),
    {
      check: 'file-not-exists',
      path: 'milestones/M-001_To_Archive.md',
      description: 'Original file location empty',
    },
    // No error
    {
      check: 'no-error-notice',
      description: 'No error about missing folder',
    },
  ],
});

