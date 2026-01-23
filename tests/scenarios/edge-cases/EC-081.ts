import { defineScenario } from '../../framework';
import { milestone, command } from '../../framework/fixtures';

/**
 * EC-081: Notion Token Invalid/Expired
 * Verifies handling of invalid or expired Notion token
 */
export default defineScenario({
  id: 'EC-081',
  name: 'Notion Token Invalid/Expired',
  category: 'edge-cases',
  description: 'Verify handling of invalid or expired Notion API token',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
    ],
    canvas: { nodes: [], edges: [] },
    settings: {
      notionToken: 'invalid-or-expired-token',
      notionDatabaseId: 'test-database-id',
    },
    notionMock: {
      authError: true,
    },
    description: 'M-001 exists, Notion token is invalid',
  },

  steps: [
    command('sync-to-notion', {}),
  ],

  expectations: [
    // Error notice
    {
      check: 'notice-shown',
      type: 'error',
      message: 'Notion authentication failed',
      description: 'Error notice about auth failure',
    },
    // Helpful message
    {
      check: 'notice-contains',
      contains: ['token', 'settings'],
      description: 'Error suggests checking token in settings',
    },
    // No crash
    {
      check: 'no-crash',
      description: 'Plugin does not crash',
    },
    // Local files unchanged
    {
      check: 'frontmatter-field-not-exists',
      path: 'milestones/M-001_MVP.md',
      field: 'notion_id',
      description: 'notion_id not added (sync failed)',
    },
  ],
});

