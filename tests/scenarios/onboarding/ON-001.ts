import { defineScenario } from '../../framework';
import { command, expectFileExists } from '../../framework/fixtures';

/**
 * ON-001: First-Time Plugin Installation
 * Verifies plugin loads correctly and commands are available
 */
export default defineScenario({
  id: 'ON-001',
  name: 'First-Time Plugin Installation',
  category: 'onboarding',
  description: 'Verify plugin loads correctly with no errors and commands are available',

  preconditions: {
    entities: [],
    canvas: null,
    description: 'Fresh vault with no Canvas Project Manager plugin data',
  },

  steps: [
    // Plugin installation is handled by Obsidian, we verify the result
    command('verify-plugin-loaded', {}),
  ],

  expectations: [
    {
      check: 'plugin-loaded',
      description: 'Plugin loads without error messages',
    },
    {
      check: 'commands-available',
      commands: ['create-structured-item', 'populate-canvas', 'reposition-nodes'],
      description: 'Plugin commands available in command palette',
    },
  ],
});

