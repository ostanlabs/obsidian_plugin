import { defineScenario } from '../../framework';
import { milestone, story, task, command } from '../../framework/fixtures';

/**
 * SC-033: Apply Visual Styling
 * Verifies correct border thickness, colors, and status indicators
 */
export default defineScenario({
  id: 'SC-033',
  name: 'Apply Visual Styling',
  category: 'canvas-operations',
  description: 'Verify correct visual styling based on type, status, priority, workstream',

  preconditions: {
    entities: [
      milestone('M-001', {
        title: 'Critical Milestone',
        status: 'In Progress',
        priority: 'Critical',
        workstream: 'engineering',
      }),
      story('S-001', {
        title: 'High Priority Story',
        status: 'Not Started',
        priority: 'High',
        workstream: 'engineering',
        parent: 'M-001',
      }),
      task('T-001', {
        title: 'Normal Task',
        status: 'Open',
        workstream: 'engineering',
        parent: 'S-001',
      }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 In Progress/Critical, S-001 Not Started/High, T-001 Open',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Border thickness by type
    {
      check: 'canvas-node-border',
      nodeId: 'M-001',
      thickness: 4,
      description: 'Milestone has thickest border (4px)',
    },
    {
      check: 'canvas-node-border',
      nodeId: 'S-001',
      thickness: 2,
      description: 'Story has medium border (2px)',
    },
    {
      check: 'canvas-node-border',
      nodeId: 'T-001',
      thickness: 1,
      description: 'Task has thinnest border (1px)',
    },
    // Workstream color (all same)
    {
      check: 'same-workstream-color',
      nodes: ['M-001', 'S-001', 'T-001'],
      description: 'All nodes have same workstream color (engineering)',
    },
    // Status styling
    {
      check: 'canvas-node-css-class',
      nodeId: 'M-001',
      cssClass: 'canvas-status-in-progress',
      description: 'M-001 has In Progress status styling',
    },
    // Priority indicator
    {
      check: 'canvas-node-css-class',
      nodeId: 'M-001',
      cssClass: 'canvas-priority-critical',
      description: 'M-001 shows Critical priority indicator',
    },
  ],
});

