import { defineScenario } from '../../framework';
import { command, expectFileExists, expectCanvasNode, expectCanvasEdge } from '../../framework/fixtures';

/**
 * SC-043: Restore Archived Entity
 * Verifies moving file out of archive and setting archived: false restores entity
 */
export default defineScenario({
  id: 'SC-043',
  name: 'Restore Archived Entity',
  category: 'archive-system',
  description: 'Verify restoring archived entity by moving file and setting archived: false',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'archive/milestones/M-001_Restored_Milestone.md',
        content: `---
id: M-001
type: milestone
title: Restored Milestone
workstream: engineering
archived: true
children:
  - S-001
---
# Restored Milestone`,
      },
      {
        path: 'stories/S-001_Child_Story.md',
        content: `---
id: S-001
type: story
title: Child Story
parent: M-001
---
# Child Story`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 in archive folder, S-001 exists with parent: M-001',
  },

  steps: [
    command('move-file', {
      from: 'archive/milestones/M-001_Restored_Milestone.md',
      to: 'milestones/M-001_Restored_Milestone.md',
    }),
    command('update-frontmatter', {
      path: 'milestones/M-001_Restored_Milestone.md',
      frontmatter: { archived: false },
    }),
    command('populate-canvas', {}),
  ],

  expectations: [
    // M-001 on canvas
    expectCanvasNode('M-001'),
    
    // Proper position in workstream
    {
      check: 'position-in-workstream-lane',
      nodeId: 'M-001',
      workstream: 'engineering',
      description: 'M-001 in correct workstream lane',
    },
    
    // Edge restored to child
    expectCanvasEdge('S-001', 'M-001'),
    
    // Fully functional
    {
      check: 'node-interactive',
      nodeId: 'M-001',
      description: 'Can edit, reposition M-001',
    },
  ],
});

