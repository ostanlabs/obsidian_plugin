import { defineScenario } from '../../framework';
import { command } from '../../framework/fixtures';

/**
 * ON-006: Configure Plugin Settings
 * Verifies plugin settings are accessible and persist
 */
export default defineScenario({
  id: 'ON-006',
  name: 'Configure Plugin Settings',
  category: 'onboarding',
  description: 'Verify plugin settings are accessible and changes persist',

  preconditions: {
    entities: [],
    canvas: null,
    description: 'Plugin installed and enabled',
  },

  steps: [
    command('open-settings', {}),
    command('set-setting', { key: 'defaultWorkstream', value: 'engineering' }),
    command('close-settings', {}),
    command('reload-plugin', {}),
  ],

  expectations: [
    {
      check: 'settings-visible',
      description: 'Plugin settings tab is accessible',
    },
    {
      check: 'setting-value',
      key: 'defaultWorkstream',
      expected: 'engineering',
      description: 'Default workstream setting persists after reload',
    },
    {
      check: 'settings-fields-exist',
      fields: ['defaultWorkstream', 'notionToken', 'notionDatabaseId'],
      description: 'All expected settings fields exist',
    },
  ],
});

