import { defineScenario } from '../../framework';
import { milestone, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * SC-061: Sync Status Change to Notion
 * Verifies status change in Obsidian syncs to Notion
 */
export default defineScenario({
  id: 'SC-061',
  name: 'Sync Status Change to Notion',
  category: 'notion-sync',
  description: 'Verify status change in Obsidian syncs to Notion',

  preconditions: {
    entities: [
      milestone('M-001', {
        title: 'MVP',
        workstream: 'engineering',
        status: 'In Progress',
        notion_id: 'notion-page-123',
      }),
    ],
    canvas: { nodes: [], edges: [] },
    settings: {
      notionToken: 'valid-test-token',
      notionDatabaseId: 'test-database-id',
    },
    notionDatabase: {
      pages: [
        { id: 'notion-page-123', properties: { id: 'M-001', status: 'In Progress' } },
      ],
    },
    description: 'M-001 exists locally and in Notion with status In Progress',
  },

  steps: [
    command('update-frontmatter', {
      path: 'milestones/M-001_MVP.md',
      frontmatter: { status: 'Done' },
    }),
    command('sync-to-notion', {}),
  ],

  expectations: [
    // Local file updated
    expectFrontmatter('milestones/M-001_MVP.md', 'status', 'Done'),
    // Notion page updated
    {
      check: 'notion-page-property',
      id: 'M-001',
      property: 'status',
      expected: 'Done',
      description: 'M-001 status updated in Notion',
    },
    // Notice
    {
      check: 'notice-shown',
      message: 'Updated 1 entity in Notion',
      description: 'Update notice displayed',
    },
  ],
});

