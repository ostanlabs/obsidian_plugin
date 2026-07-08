import { defineScenario } from '../../framework';
import { milestone, command, expectFrontmatter, expectCanvasNode } from '../../framework/fixtures';

/**
 * SC-011: Create Orphan Story (No Parent)
 * Verifies story without parent is positioned in orphan grid
 */
export default defineScenario({
  id: 'SC-011',
  name: 'Create Orphan Story (No Parent)',
  category: 'hierarchy',
  description: 'Verify story without parent is positioned in orphan grid at bottom of canvas',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'MVP', workstream: 'engineering' }),
      milestone('M-002', { title: 'Launch', workstream: 'business' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Canvas has workstream lanes with milestones',
  },

  steps: [
    command('create-structured-item', {
      type: 'story',
      title: 'Orphan Story',
      // No parent specified
    }),
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // The plugin's canonical create format ALWAYS emits `parent: ""` for entities
    // without a parent (util/frontmatter.ts createWithFrontmatter: `parent` is in
    // the alwaysInclude list and is written as "" when unset), so the parsed
    // frontmatter value is the empty string, not null/absent.
    expectFrontmatter('stories/S-001_Orphan_Story.md', 'parent', ''),
    expectCanvasNode('S-001'),
    {
      check: 'position-in-orphan-grid',
      nodeId: 'S-001',
      description: 'Story at BOTTOM of canvas (Y > all workstream nodes)',
    },
    {
      check: 'no-parent-edge',
      nodeId: 'S-001',
      description: 'No edge from story to any parent',
    },
  ],
});

