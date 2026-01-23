import { defineScenario } from '../../framework';
import { milestone, story, task, command } from '../../framework/fixtures';

/**
 * EC-043: Large Canvas (100+ Nodes)
 * Verifies performance with large number of nodes
 */
export default defineScenario({
  id: 'EC-043',
  name: 'Large Canvas (100+ Nodes)',
  category: 'edge-cases',
  description: 'Verify performance with 100+ nodes on canvas',

  preconditions: {
    entities: [
      // 10 milestones
      ...Array.from({ length: 10 }, (_, i) =>
        milestone(`M-${String(i + 1).padStart(3, '0')}`, {
          title: `Milestone ${i + 1}`,
          workstream: i % 2 === 0 ? 'engineering' : 'business',
        })
      ),
      // 30 stories (3 per milestone)
      ...Array.from({ length: 30 }, (_, i) =>
        story(`S-${String(i + 1).padStart(3, '0')}`, {
          title: `Story ${i + 1}`,
          parent: `M-${String(Math.floor(i / 3) + 1).padStart(3, '0')}`,
        })
      ),
      // 60 tasks (2 per story)
      ...Array.from({ length: 60 }, (_, i) =>
        task(`T-${String(i + 1).padStart(3, '0')}`, {
          title: `Task ${i + 1}`,
          parent: `S-${String(Math.floor(i / 2) + 1).padStart(3, '0')}`,
        })
      ),
    ],
    canvas: { nodes: [], edges: [] },
    description: '100 entities: 10 milestones, 30 stories, 60 tasks',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All 100 nodes on canvas
    {
      check: 'canvas-node-count',
      expected: 100,
      description: 'All 100 nodes on canvas',
    },
    // Commands complete in reasonable time
    {
      check: 'command-completes',
      timeout: 30000,
      description: 'Populate completes within 30 seconds',
    },
    {
      check: 'command-completes',
      timeout: 30000,
      description: 'Reposition completes within 30 seconds',
    },
    // No overlap
    {
      check: 'no-node-overlap',
      description: 'No nodes overlapping',
    },
    // Workstream lanes correct
    {
      check: 'workstream-lane-exists',
      workstream: 'engineering',
      description: 'Engineering lane exists',
    },
    {
      check: 'workstream-lane-exists',
      workstream: 'business',
      description: 'Business lane exists',
    },
    // Memory usage reasonable
    {
      check: 'memory-usage',
      maxMB: 500,
      description: 'Memory usage under 500MB',
    },
  ],
});

