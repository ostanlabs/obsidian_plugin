import { defineScenario } from '../../framework';
import { milestone, story, task, command, expectCanvasNode } from '../../framework/fixtures';

/**
 * SC-030: Populate Canvas from Vault
 * Verifies populate adds new entities, handles archived, excludes archive folder
 */
export default defineScenario({
  id: 'SC-030',
  name: 'Populate Canvas from Vault',
  category: 'canvas-operations',
  description: 'Verify populate adds new entities, moves archived files, excludes archive folder',

  preconditions: {
    entities: [
      // 3 entities already on canvas
      milestone('M-001', { title: 'Existing 1', workstream: 'engineering' }),
      milestone('M-002', { title: 'Existing 2', workstream: 'engineering' }),
      story('S-001', { title: 'Existing Story', parent: 'M-001' }),
      // 5 additional entities not on canvas
      story('S-002', { title: 'New Story 1', parent: 'M-001' }),
      story('S-003', { title: 'New Story 2', parent: 'M-002' }),
      task('T-001', { title: 'New Task 1', parent: 'S-001' }),
      task('T-002', { title: 'New Task 2', parent: 'S-002' }),
      task('T-003', { title: 'New Task 3', parent: 'S-003' }),
      // 1 entity with archived: true
      milestone('M-003', { title: 'Archived Milestone', workstream: 'engineering', archived: true }),
    ],
    canvas: {
      nodes: [
        { id: 'M-001', file: 'milestones/M-001_Existing_1.md' },
        { id: 'M-002', file: 'milestones/M-002_Existing_2.md' },
        { id: 'S-001', file: 'stories/S-001_Existing_Story.md' },
      ],
      edges: [],
    },
    description: 'Canvas has 3 entities, vault has 5 more + 1 archived',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Archived file moved
    {
      check: 'file-moved',
      from: 'milestones/M-003_Archived_Milestone.md',
      to: 'archive/milestones/M-003_Archived_Milestone.md',
      description: 'Archived file moved to archive folder',
    },
    // Archived node not on canvas
    {
      check: 'canvas-node-not-exists',
      nodeId: 'M-003',
      description: 'Archived node removed from canvas',
    },
    // New nodes added (was 3, now 8)
    expectCanvasNode('S-002'),
    expectCanvasNode('S-003'),
    expectCanvasNode('T-001'),
    expectCanvasNode('T-002'),
    expectCanvasNode('T-003'),
    {
      check: 'canvas-node-count',
      expected: 8,
      description: '8 nodes on canvas (3 existing + 5 new)',
    },
    // Notice
    {
      check: 'notice-shown',
      message: 'Added 5 entities, archived 1',
      description: 'Notice shows correct counts',
    },
  ],
});

