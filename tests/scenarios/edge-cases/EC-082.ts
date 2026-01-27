import { defineScenario } from '../../framework';
import { milestone, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * EC-082: Notion Page Deleted Externally
 * Verifies handling when Notion page was deleted outside Obsidian
 */
export default defineScenario({
  id: 'EC-082',
  name: 'Notion Page Deleted Externally',
  category: 'edge-cases',
  description: 'Verify handling when Notion page was deleted outside Obsidian',

  preconditions: {
    entities: [
      milestone('M-001', {
        title: 'MVP',
        workstream: 'engineering',
        notion_id: 'deleted-page-123',
      }),
    ],
    canvas: { nodes: [], edges: [] },
    settings: {
      notionToken: 'valid-test-token',
      notionDatabaseId: 'test-database-id',
    },
    notionMock: {
      deletedPages: ['deleted-page-123'],
    },
    description: 'M-001 has notion_id pointing to deleted Notion page',
  },

  steps: [
    command('sync-to-notion', {}),
  ],

  expectations: [
    // Warning about deleted page
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Notion page not found',
      description: 'Warning about deleted Notion page',
    },
    // New page created
    {
      check: 'notion-page-exists',
      id: 'M-001',
      description: 'New Notion page created for M-001',
    },
    // notion_id updated
    {
      check: 'frontmatter-changed',
      path: 'milestones/M-001_MVP.md',
      field: 'notion_id',
      oldValue: 'deleted-page-123',
      description: 'notion_id updated to new page ID',
    },
    // Notice about recreation
    {
      check: 'notice-contains',
      contains: ['recreated', 'M-001'],
      description: 'Notice mentions page was recreated',
    },
  ],
});

