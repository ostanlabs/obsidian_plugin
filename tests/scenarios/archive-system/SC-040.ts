import { defineScenario } from '../../framework';
import { milestone, story, command, expectFileExists } from '../../framework/fixtures';

/**
 * SC-040: Archive Completed Milestone
 * Verifies archived milestone is moved to archive folder and removed from canvas
 */
export default defineScenario({
  id: 'SC-040',
  name: 'Archive Completed Milestone',
  category: 'archive-system',
  description: 'Verify archived milestone moves to archive folder, removed from canvas, children orphaned',

  preconditions: {
    entities: [
      milestone('M-001', {
        title: 'Completed MVP',
        workstream: 'engineering',
        archived: true,
        children: ['S-001', 'S-002'],
      }),
      story('S-001', { title: 'Story 1', parent: 'M-001' }),
      story('S-002', { title: 'Story 2', parent: 'M-001' }),
    ],
    canvas: {
      nodes: [
        { id: 'M-001', file: 'milestones/M-001_Completed_MVP.md' },
        { id: 'S-001', file: 'stories/S-001_Story_1.md' },
        { id: 'S-002', file: 'stories/S-002_Story_2.md' },
      ],
      edges: [],
    },
    description: 'M-001 with archived: true, has children S-001, S-002',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // File moved
    {
      check: 'file-not-exists',
      path: 'milestones/M-001_Completed_MVP.md',
      description: 'Original file location empty',
    },
    expectFileExists('archive/milestones/M-001_Completed_MVP.md'),
    
    // Node removed from canvas
    {
      check: 'canvas-node-not-exists',
      nodeId: 'M-001',
      description: 'M-001 not on canvas',
    },
    
    // Children remain on canvas
    {
      check: 'canvas-node-exists',
      nodeId: 'S-001',
      description: 'S-001 still on canvas',
    },
    {
      check: 'canvas-node-exists',
      nodeId: 'S-002',
      description: 'S-002 still on canvas',
    },
    
    // Children orphaned (in orphan grid)
    {
      check: 'position-in-orphan-grid',
      nodeId: 'S-001',
      description: 'S-001 in orphan area (parent gone)',
    },
    {
      check: 'position-in-orphan-grid',
      nodeId: 'S-002',
      description: 'S-002 in orphan area (parent gone)',
    },
    
    // Archive folder created
    expectFileExists('archive/milestones/.gitkeep'),
  ],
});

