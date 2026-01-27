import { defineScenario } from '../../framework';
import { story, command, expectFrontmatter } from '../../framework/fixtures';

/**
 * EC-025: Dependency on Archived Entity
 * Verifies handling when depends_on references archived entity
 */
export default defineScenario({
  id: 'EC-025',
  name: 'Dependency on Archived Entity',
  category: 'edge-cases',
  description: 'Verify handling when depends_on references archived entity',

  preconditions: {
    entities: [
      story('S-002', { title: 'Active Story', depends_on: ['S-001'] }),
    ],
    files: [
      {
        path: 'archive/stories/S-001_Archived.md',
        content: `---
id: S-001
type: story
title: Archived Story
archived: true
---
# Archived Story`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-002 depends on S-001, S-001 is in archive folder',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // S-002 on canvas
    {
      check: 'canvas-node-exists',
      nodeId: 'S-002',
      description: 'S-002 on canvas',
    },
    // S-001 NOT on canvas (archived)
    {
      check: 'canvas-node-not-exists',
      nodeId: 'S-001',
      description: 'S-001 NOT on canvas (archived)',
    },
    // No edge (dependency is archived)
    {
      check: 'canvas-edge-count',
      expected: 0,
      description: 'No edges (dependency is archived)',
    },
    // Warning about archived dependency
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'depends on archived entity',
      description: 'Warning about dependency on archived entity',
    },
    // Frontmatter unchanged
    expectFrontmatter('stories/S-002_Active_Story.md', 'depends_on', ['S-001']),
  ],
});

