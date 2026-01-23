import { defineScenario } from '../../framework';
import { command, expectFileExists } from '../../framework/fixtures';

/**
 * ON-003: Create First Canvas
 * Verifies canvas creation command works correctly
 */
export default defineScenario({
  id: 'ON-003',
  name: 'Create First Canvas',
  category: 'onboarding',
  description: 'Verify Create Project Canvas creates a new canvas file',

  preconditions: {
    entities: [],
    canvas: null,
    description: 'Plugin installed, folder structure may or may not exist',
  },

  steps: [
    command('create-project-canvas', { name: 'My Project' }),
  ],

  expectations: [
    expectFileExists('My Project.canvas'),
    {
      check: 'canvas-valid',
      path: 'My Project.canvas',
      description: 'Canvas file is valid JSON with empty nodes array',
    },
    {
      check: 'canvas-opened',
      path: 'My Project.canvas',
      description: 'Canvas view is active',
    },
  ],
});

