import { defineScenario } from '../../framework';
import { milestone, story, task, command } from '../../framework/fixtures';

/**
 * SC-032: Toggle Entity Type Visibility
 * Verifies hiding entity types removes nodes and edges, state persists
 */
export default defineScenario({
  id: 'SC-032',
  name: 'Toggle Entity Type Visibility',
  category: 'canvas-operations',
  description: 'Verify hiding tasks removes task nodes and edges, state persists on reload',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
      milestone('M-002', { title: 'Launch', workstream: 'engineering' }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
      story('S-002', { title: 'API', parent: 'M-001' }),
      story('S-003', { title: 'UI', parent: 'M-002' }),
      story('S-004', { title: 'Docs', parent: 'M-002' }),
      task('T-001', { title: 'Login', parent: 'S-001' }),
      task('T-002', { title: 'Signup', parent: 'S-001' }),
      task('T-003', { title: 'Endpoints', parent: 'S-002' }),
      task('T-004', { title: 'Schema', parent: 'S-002' }),
      task('T-005', { title: 'Components', parent: 'S-003' }),
      task('T-006', { title: 'Styles', parent: 'S-003' }),
      task('T-007', { title: 'README', parent: 'S-004' }),
      task('T-008', { title: 'API Docs', parent: 'S-004' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Canvas shows 2 milestones, 4 stories, 8 tasks',
  },

  steps: [
    command('populate-canvas', {}),
    command('toggle-visibility', { entityType: 'task', visible: false }),
  ],

  expectations: [
    // Tasks hidden
    {
      check: 'canvas-node-not-visible',
      nodeId: 'T-001',
      description: 'Task T-001 not visible',
    },
    {
      check: 'visible-node-count-by-type',
      type: 'task',
      expected: 0,
      description: '0 task nodes visible',
    },
    // Milestones and stories still visible
    {
      check: 'visible-node-count-by-type',
      type: 'milestone',
      expected: 2,
      description: '2 milestones still visible',
    },
    {
      check: 'visible-node-count-by-type',
      type: 'story',
      expected: 4,
      description: '4 stories still visible',
    },
    // Task edges hidden
    {
      check: 'edges-to-type-hidden',
      type: 'task',
      description: 'Edges to/from tasks not visible',
    },
    // State persists
    {
      check: 'visibility-state-persisted',
      entityType: 'task',
      visible: false,
      description: 'After reload, tasks still hidden',
    },
  ],
});

