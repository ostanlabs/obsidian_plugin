import { defineScenario } from '../../framework';
import { command, expectFileExists } from '../../framework/fixtures';

/**
 * ON-002: Initial Folder Structure Setup
 * Verifies project structure initialization creates all required folders
 */
export default defineScenario({
  id: 'ON-002',
  name: 'Initial Folder Structure Setup',
  category: 'onboarding',
  description: 'Verify Initialize Project Structure creates all required folders',

  preconditions: {
    entities: [],
    canvas: null,
    description: 'Empty vault with no project folders',
  },

  steps: [
    command('initialize-project-structure', {}),
  ],

  expectations: [
    expectFileExists('milestones/.gitkeep'),
    expectFileExists('stories/.gitkeep'),
    expectFileExists('tasks/.gitkeep'),
    expectFileExists('decisions/.gitkeep'),
    expectFileExists('documents/.gitkeep'),
    expectFileExists('features/.gitkeep'),
    expectFileExists('archive/.gitkeep'),
    {
      check: 'notice-shown',
      message: 'Project structure initialized',
      description: 'Success notice displayed',
    },
  ],
});

