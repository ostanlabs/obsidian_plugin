import { defineScenario } from '../../framework';
import { command } from '../../framework/fixtures';

/**
 * ON-007: First Notion Integration Setup
 * Verifies Notion database initialization
 */
export default defineScenario({
  id: 'ON-007',
  name: 'First Notion Integration Setup',
  category: 'onboarding',
  description: 'Verify Notion database initialization creates database with correct schema',

  preconditions: {
    entities: [],
    canvas: null,
    settings: {
      notionToken: 'valid-test-token',
      notionParentPageId: 'test-parent-page-id',
    },
    description: 'Plugin installed, Notion token and parent page ID configured',
  },

  steps: [
    command('initialize-notion-database', {}),
  ],

  expectations: [
    {
      check: 'notion-database-created',
      description: 'New database created in Notion',
    },
    {
      check: 'notion-properties-exist',
      properties: ['id', 'type', 'title', 'status', 'priority', 'workstream', 'depends_on', 'parent', 'blocks'],
      description: 'All entity properties exist in Notion database schema',
    },
    {
      check: 'setting-value',
      key: 'notionDatabaseId',
      notEmpty: true,
      description: 'Database ID saved in settings',
    },
    {
      check: 'notice-shown',
      message: 'Notion database initialized',
      description: 'Success notice displayed',
    },
  ],
});

