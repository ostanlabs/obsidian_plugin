import { defineScenario } from '../../framework';
import { milestone, command } from '../../framework/fixtures';

/**
 * EC-080: Notion API Rate Limit
 * Verifies handling of Notion API rate limiting
 */
export default defineScenario({
  id: 'EC-080',
  name: 'Notion API Rate Limit',
  category: 'edge-cases',
  description: 'Verify handling of Notion API rate limiting (429 responses)',

  preconditions: {
    entities: [
      // Many entities to trigger rate limit
      ...Array.from({ length: 50 }, (_, i) =>
        milestone(`M-${String(i + 1).padStart(3, '0')}`, {
          title: `Milestone ${i + 1}`,
          workstream: 'engineering',
        })
      ),
    ],
    canvas: { nodes: [], edges: [] },
    settings: {
      notionToken: 'valid-test-token',
      notionDatabaseId: 'test-database-id',
    },
    notionMock: {
      rateLimit: {
        requestsBeforeLimit: 10,
        retryAfterSeconds: 1,
      },
    },
    description: '50 entities to sync, Notion rate limits after 10 requests',
  },

  steps: [
    command('sync-to-notion', {}),
  ],

  expectations: [
    // Sync completes (with retries)
    {
      check: 'command-completes',
      timeout: 120000,
      description: 'Sync completes within 2 minutes (with retries)',
    },
    // All entities synced
    {
      check: 'notion-page-count',
      expected: 50,
      description: 'All 50 entities synced to Notion',
    },
    // Notice about rate limiting
    {
      check: 'notice-shown',
      type: 'info',
      message: 'Rate limited',
      description: 'Notice about rate limiting and retries',
    },
    // No error
    {
      check: 'no-error-notice',
      description: 'No error despite rate limiting',
    },
    // Exponential backoff used
    {
      check: 'log-contains',
      message: 'Retrying after',
      description: 'Log shows retry with backoff',
    },
  ],
});

