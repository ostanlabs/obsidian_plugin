import { defineScenario } from '../../framework';
import { milestone, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * SC-063: Bidirectional Sync Conflict
 * Verifies conflict resolution when both sides changed
 */
export default defineScenario({
  id: 'SC-063',
  name: 'Bidirectional Sync Conflict',
  category: 'notion-sync',
  description: 'Verify conflict resolution when both Obsidian and Notion changed same entity',

  preconditions: {
    entities: [
      milestone('M-001', {
        title: 'MVP',
        workstream: 'engineering',
        status: 'In Progress',
        priority: 'High',
        notion_id: 'notion-page-123',
        last_synced: '2026-01-24T10:00:00Z',
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
          last_edited_time: '2026-01-25T09:00:00Z',
        },
      ],
    },
    description: 'M-001 changed locally (priority High) and in Notion (status Done, priority Critical)',
  },

  steps: [
    command('sync-to-notion', {}),
  ],

  expectations: [
    // Conflict detected
    {
      check: 'conflict-dialog-shown',
      entityId: 'M-001',
      description: 'Conflict dialog shown for M-001',
    },
    // After user chooses "Keep Notion"
    {
      check: 'after-conflict-resolution',
      choice: 'keep-notion',
      expectations: [
        expectFrontmatter('milestones/M-001_MVP.md', 'status', 'Done'),
        expectFrontmatter('milestones/M-001_MVP.md', 'priority', 'Critical'),
      ],
      description: 'Local file updated with Notion values',
    },
    // After user chooses "Keep Local"
    {
      check: 'after-conflict-resolution',
      choice: 'keep-local',
      expectations: [
        {
          check: 'notion-page-property',
          id: 'M-001',
          property: 'priority',
          expected: 'High',
          description: 'Notion updated with local priority',
        },
      ],
      description: 'Notion updated with local values',
    },
    // last_synced updated
    {
      check: 'frontmatter-updated',
      path: 'milestones/M-001_MVP.md',
      field: 'last_synced',
      description: 'last_synced timestamp updated',
    },
  ],
});

