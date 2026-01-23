import { defineScenario } from '../../framework';
import { story, command, expectCanvasEdge } from '../../framework/fixtures';

/**
 * SC-023: Transitive Dependency Removal
 * Verifies transitive edges are not rendered on canvas
 */
export default defineScenario({
  id: 'SC-023',
  name: 'Transitive Dependency Removal',
  category: 'dependency-management',
  description: 'Verify transitive dependency edge S-003→S-001 is NOT rendered',

  preconditions: {
    entities: [
      story('S-001', { title: 'Foundation' }),
      story('S-002', { title: 'Middle', depends_on: ['S-001'] }),
      story('S-003', { title: 'Top', depends_on: ['S-001', 'S-002'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-003 depends on both S-001 and S-002, S-002 depends on S-001',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Direct edges exist
    expectCanvasEdge('S-001', 'S-002'),
    expectCanvasEdge('S-002', 'S-003'),
    
    // Transitive edge does NOT exist
    {
      check: 'canvas-edge-not-exists',
      fromNode: 'S-001',
      toNode: 'S-003',
      description: 'Edge S-003→S-001 does NOT exist (transitive)',
    },
    
    // Total edge count
    {
      check: 'canvas-edge-count',
      expected: 2,
      description: 'Total 2 edges (not 3)',
    },
    
    // Frontmatter unchanged
    {
      check: 'frontmatter-array-equals',
      path: 'stories/S-003_Top.md',
      field: 'depends_on',
      expected: ['S-001', 'S-002'],
      description: 'S-003 frontmatter still has both dependencies',
    },
  ],
});

