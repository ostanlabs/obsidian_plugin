import { defineScenario } from '../../framework';
import { milestone, command, expectFileExists } from '../../framework/fixtures';

/**
 * SC-042: Prevent Re-Processing Archived Files
 * Verifies files in archive folder are excluded from processing
 */
export default defineScenario({
  id: 'SC-042',
  name: 'Prevent Re-Processing Archived Files',
  category: 'archive-system',
  description: 'Verify files in archive folder are excluded even if archived: false',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'archive/milestones/M-001_Old_Milestone.md',
        content: `---
id: M-001
type: milestone
title: Old Milestone
archived: false
---
# Old Milestone
This file is in archive folder but has archived: false`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 in archive folder with archived: false (user forgot to set true)',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // M-001 NOT on canvas (archive folder excluded)
    {
      check: 'canvas-node-not-exists',
      nodeId: 'M-001',
      description: 'M-001 NOT on canvas (archive folder excluded from scan)',
    },
    
    // File not moved
    expectFileExists('archive/milestones/M-001_Old_Milestone.md'),
    
    // No error
    {
      check: 'no-error-notice',
      description: 'Command completes without error',
    },
  ],
});

