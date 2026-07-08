import { defineScenario } from '../../framework';
import { milestone, story, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * SC-060: Initial Sync to Notion
 * Verifies first sync creates pages in Notion with correct properties
 */
export default defineScenario({
  id: 'SC-060',
  name: 'Initial Sync to Notion',
  category: 'notion-sync',
  description: 'Verify first sync creates pages in Notion with correct properties',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering', status: 'In Progress' }),
      story('S-001', { title: 'Auth', parent: 'M-001', status: 'Not Started' }),
    ],
    canvas: { nodes: [], edges: [] },
    settings: {
      notionToken: 'valid-test-token',
      notionDatabaseId: 'test-database-id',
    },
    notionDatabase: {
      pages: [],
    },
    description: 'M-001 and S-001 exist locally, Notion database empty',
  },

  steps: [
    command('sync-to-notion', {}),
  ],

  expectations: [
    // Notion pages created
    {
      check: 'notion-page-exists',
      id: 'M-001',
      description: 'M-001 page exists in Notion',
    },
    {
      check: 'notion-page-exists',
      id: 'S-001',
      description: 'S-001 page exists in Notion',
    },
    // Properties synced
    {
      check: 'notion-page-property',
      id: 'M-001',
      property: 'status',
      expected: 'In Progress',
      description: 'M-001 status synced to Notion',
    },
    {
      check: 'notion-page-property',
      id: 'S-001',
      property: 'parent',
      expected: 'M-001',
      description: 'S-001 parent synced to Notion',
    },
    // Local files updated with the Notion page id. The real plugin stores this
    // in `notion_page_id` (types.ts:116; main.ts updateNoteWithNotionId), NOT
    // `notion_id`. The MockAdapter deterministically assigns `notion-<entityId>`.
    expectFrontmatter('milestones/M-001_MVP.md', 'notion_page_id', 'notion-M-001'),
    expectFrontmatter('stories/S-001_Auth.md', 'notion_page_id', 'notion-S-001'),
    // Notice
    {
      check: 'notice-shown',
      message: 'Synced 2 entities to Notion',
      description: 'Success notice displayed',
    },
  ],
});

