import { defineScenario } from '../../framework';
import { milestone, command } from '../../framework/fixtures';

/**
 * EC-044: Canvas with Stale Nodes
 * Verifies handling when canvas has nodes for deleted files
 */
export default defineScenario({
  id: 'EC-044',
  name: 'Canvas with Stale Nodes',
  category: 'edge-cases',
  description: 'Verify handling when canvas has nodes for files that no longer exist',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'Existing', workstream: 'engineering' }),
    ],
    canvas: {
      nodes: [
        { id: 'M-001', file: 'milestones/M-001_Existing.md', x: 0, y: 0 },
        { id: 'M-002', file: 'milestones/M-002_Deleted.md', x: 500, y: 0 },
        { id: 'S-001', file: 'stories/S-001_Gone.md', x: 1000, y: 0 },
      ],
      edges: [
        { fromNode: 'S-001', toNode: 'M-002' },
      ],
    },
    description: 'Canvas has M-001 (exists), M-002 and S-001 (files deleted)',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Stale nodes removed
    {
      check: 'canvas-node-not-exists',
      nodeId: 'M-002',
      description: 'M-002 node removed (file deleted)',
    },
    {
      check: 'canvas-node-not-exists',
      nodeId: 'S-001',
      description: 'S-001 node removed (file deleted)',
    },
    // Valid node preserved
    {
      check: 'canvas-node-exists',
      nodeId: 'M-001',
      description: 'M-001 node preserved',
    },
    // Stale edges removed
    {
      check: 'canvas-edge-count',
      expected: 0,
      description: 'Stale edge removed',
    },
    // Warning about removed nodes
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Removed 2 stale nodes',
      description: 'Warning about removed stale nodes',
    },
    // Final node count
    {
      check: 'canvas-node-count',
      expected: 1,
      description: 'Only 1 valid node remains',
    },
  ],
});

