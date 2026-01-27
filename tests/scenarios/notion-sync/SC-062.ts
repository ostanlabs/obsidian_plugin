import { defineScenario } from '../../framework';
import { milestone, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * SC-062: Pull Changes from Notion
 * Verifies changes made in Notion are pulled to Obsidian
 */
export default defineScenario({
  id: 'SC-062',
  name: 'Pull Changes from Notion',
  category: 'notion-sync',
  description: 'Verify changes made in Notion are pulled to Obsidian',

  preconditions: {
    entities: [
      milestone('M-001', {
        title: 'MVP',
        workstream: 'engineering',
        status: 'In Progress',
        priority: 'Medium',
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
        {
          id: 'notion-page-123',
          properties: {
            id: 'M-001',
            status: 'Done',
            priority: 'Critical',
          },
        },
      ],
    },
    description: 'M-001 local has status In Progress, Notion has status Done',
  },

  steps: [
    command('pull-from-notion', {}),
  ],

  expectations: [
    // Local file updated
    expectFrontmatter('milestones/M-001_MVP.md', 'status', 'Done'),
    expectFrontmatter('milestones/M-001_MVP.md', 'priority', 'Critical'),
    // Notice
    {
      check: 'notice-shown',
      message: 'Pulled 1 entity from Notion',
      description: 'Pull notice displayed',
    },
    // Conflict handling (if any)
    {
      check: 'no-conflict-dialog',
      description: 'No conflict dialog (Notion wins by default)',
    },
  ],
});

