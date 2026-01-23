import { defineScenario } from '../../framework';
import { milestone, story, command, expectFileExists, expectFrontmatter } from '../../framework/fixtures';

/**
 * SC-041: Archive Entity with Children
 * Verifies archiving parent does NOT archive children
 */
export default defineScenario({
  id: 'SC-041',
  name: 'Archive Entity with Children',
  category: 'archive-system',
  description: 'Verify archiving parent does NOT cascade to children',

  preconditions: {
    entities: [
      milestone('M-001', {
        title: 'Parent Milestone',
        workstream: 'engineering',
        archived: true,
        children: ['S-001', 'S-002'],
      }),
      story('S-001', { title: 'Child Story 1', parent: 'M-001' }),
      story('S-002', { title: 'Child Story 2', parent: 'M-001' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 with archived: true, children S-001 and S-002',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // M-001 archived
    expectFileExists('archive/milestones/M-001_Parent_Milestone.md'),
    
    // Children NOT archived
    expectFileExists('stories/S-001_Child_Story_1.md'),
    expectFileExists('stories/S-002_Child_Story_2.md'),
    {
      check: 'file-not-exists',
      path: 'archive/stories/S-001_Child_Story_1.md',
      description: 'S-001 NOT in archive',
    },
    
    // Children on canvas
    {
      check: 'canvas-node-exists',
      nodeId: 'S-001',
      description: 'S-001 on canvas',
    },
    {
      check: 'canvas-node-exists',
      nodeId: 'S-002',
      description: 'S-002 on canvas',
    },
    
    // Parent reference preserved in children
    expectFrontmatter('stories/S-001_Child_Story_1.md', 'parent', 'M-001'),
    expectFrontmatter('stories/S-002_Child_Story_2.md', 'parent', 'M-001'),
  ],
});

