import { defineScenario } from '../../framework';
import { milestone, story, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * WS-003: Cross-Workstream Dependencies
 * Verifies edges span across workstream lanes correctly
 */
export default defineScenario({
  id: 'WS-003',
  name: 'Cross-Workstream Dependencies',
  category: 'workstream',
  description: 'Verify edges span across workstream lanes with correct visual representation',

  preconditions: {
    entities: [
      // Engineering workstream
      milestone('M-001', { title: 'Backend', workstream: 'engineering' }),
      milestone('M-002', { title: 'API', workstream: 'engineering', depends_on: ['M-001'] }),
      // Business workstream - depends on engineering
      milestone('M-003', { title: 'Launch', workstream: 'business', depends_on: ['M-002'] }),
      milestone('M-004', { title: 'Sales', workstream: 'business', depends_on: ['M-003'] }),
      // Design workstream - depends on both
      milestone('M-005', { title: 'UI', workstream: 'design', depends_on: ['M-001'] }),
      milestone('M-006', { title: 'Branding', workstream: 'design', depends_on: ['M-003', 'M-005'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Complex cross-workstream dependencies',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All edges exist
    expectCanvasEdge('M-001', 'M-002'),
    expectCanvasEdge('M-002', 'M-003'),
    expectCanvasEdge('M-003', 'M-004'),
    expectCanvasEdge('M-001', 'M-005'),
    expectCanvasEdge('M-003', 'M-006'),
    expectCanvasEdge('M-005', 'M-006'),
    // Cross-workstream edges span lanes
    {
      check: 'edge-crosses-workstream-lanes',
      fromNode: 'M-002',
      toNode: 'M-003',
      description: 'Edge M-002→M-003 crosses engineering→business',
    },
    {
      check: 'edge-crosses-workstream-lanes',
      fromNode: 'M-001',
      toNode: 'M-005',
      description: 'Edge M-001→M-005 crosses engineering→design',
    },
    // X ordering maintained across workstreams
    {
      check: 'position-left-of',
      leftNode: 'M-001',
      rightNode: 'M-003',
      description: 'M-001 LEFT of M-003 (cross-workstream dependency)',
    },
    {
      check: 'position-left-of',
      leftNode: 'M-002',
      rightNode: 'M-003',
      description: 'M-002 LEFT of M-003 (direct dependency)',
    },
    // No edge overlap (edges don't cross each other unnecessarily)
    {
      check: 'minimal-edge-crossings',
      description: 'Edges have minimal crossings',
    },
  ],
});

