import { defineScenario } from '../../framework';
import { milestone, story, task, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * EC-071: Visibility Toggle Affects Edges
 * Verifies edges are hidden when either endpoint is hidden
 */
export default defineScenario({
  id: 'EC-071',
  name: 'Visibility Toggle Affects Edges',
  category: 'edge-cases',
  description: 'Verify edges are hidden when either endpoint node is hidden',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
      story('S-001', { title: 'Auth', parent: 'M-001' }),
      story('S-002', { title: 'API', parent: 'M-001', depends_on: ['S-001'] }),
      task('T-001', { title: 'Login', parent: 'S-001' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 with children S-001, S-002; S-002 depends on S-001; T-001 under S-001',
  },

  steps: [
    command('populate-canvas', {}),
    command('toggle-visibility', { entityType: 'task', visible: false }),
  ],

  expectations: [
    // Task hidden
    {
      check: 'canvas-node-not-visible',
      nodeId: 'T-001',
      description: 'T-001 not visible',
    },
    // Edge to task hidden
    {
      check: 'canvas-edge-not-visible',
      fromNode: 'T-001',
      toNode: 'S-001',
      description: 'Edge T-001→S-001 not visible',
    },
    // Other edges still visible
    {
      check: 'canvas-edge-visible',
      fromNode: 'S-001',
      toNode: 'M-001',
      description: 'Edge S-001→M-001 still visible',
    },
    {
      check: 'canvas-edge-visible',
      fromNode: 'S-002',
      toNode: 'M-001',
      description: 'Edge S-002→M-001 still visible',
    },
    {
      check: 'canvas-edge-visible',
      fromNode: 'S-001',
      toNode: 'S-002',
      description: 'Edge S-001→S-002 (dependency) still visible',
    },
    // Visible edge count
    {
      check: 'visible-edge-count',
      expected: 3,
      description: '3 visible edges (4 total - 1 hidden)',
    },
  ],
});

