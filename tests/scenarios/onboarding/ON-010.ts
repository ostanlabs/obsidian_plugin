import { defineScenario } from '../../framework';
import { milestone, story, task, decision, document as doc, command, expectCanvasNode, expectCanvasEdge } from '../../framework/fixtures';

/**
 * ON-010: Onboarding with Sample Data
 * Verifies plugin works correctly with sample project data
 */
export default defineScenario({
  id: 'ON-010',
  name: 'Onboarding with Sample Data',
  category: 'onboarding',
  description: 'Verify plugin handles sample project with multiple entity types',

  preconditions: {
    entities: [
      // 2 milestones in different workstreams
      milestone('M-001', { title: 'Backend MVP', workstream: 'engineering' }),
      milestone('M-002', { title: 'Launch Campaign', workstream: 'business' }),
      // 3 stories (2 under M-001, 1 under M-002)
      story('S-001', { title: 'API Design', parent: 'M-001' }),
      story('S-002', { title: 'Database Setup', parent: 'M-001' }),
      story('S-003', { title: 'Marketing Plan', parent: 'M-002' }),
      // 4 tasks distributed under stories
      task('T-001', { title: 'Define endpoints', parent: 'S-001' }),
      task('T-002', { title: 'Write schemas', parent: 'S-001' }),
      task('T-003', { title: 'Setup Postgres', parent: 'S-002' }),
      task('T-004', { title: 'Draft copy', parent: 'S-003' }),
      // 1 decision affecting a story
      decision('DEC-001', { title: 'Use REST vs GraphQL', affects: ['S-001'] }),
      // 1 document
      doc('DOC-001', { title: 'API Spec', implemented_by: ['S-001'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Sample project with multiple entity types',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // All 11 entities on canvas
    expectCanvasNode('M-001'),
    expectCanvasNode('M-002'),
    expectCanvasNode('S-001'),
    expectCanvasNode('S-002'),
    expectCanvasNode('S-003'),
    expectCanvasNode('T-001'),
    expectCanvasNode('T-002'),
    expectCanvasNode('T-003'),
    expectCanvasNode('T-004'),
    expectCanvasNode('DEC-001'),
    expectCanvasNode('DOC-001'),
    
    // Workstream lanes (different Y bands)
    {
      check: 'different-workstream-lanes',
      nodes: ['M-001', 'M-002'],
      description: 'Engineering and business milestones in different Y bands',
    },
    
    // Hierarchy visible
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'M-001',
      description: 'Children LEFT of parents',
    },
    
    // Decision edge
    expectCanvasEdge('DEC-001', 'S-001'),
  ],
});

