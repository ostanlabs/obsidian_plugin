import { defineScenario } from '../../framework';
import { command, expectFileExists, expectFrontmatter, expectCanvasNode, expectCanvasEdge } from '../../framework/fixtures';

/**
 * ON-008: Complete Onboarding Workflow
 * Verifies full onboarding flow from empty vault to working project
 */
export default defineScenario({
  id: 'ON-008',
  name: 'Complete Onboarding Workflow',
  category: 'onboarding',
  description: 'Verify complete onboarding from empty vault to populated canvas',

  preconditions: {
    entities: [],
    canvas: null,
    description: 'Fresh vault with plugin installed',
  },

  steps: [
    command('initialize-project-structure', {}),
    command('create-project-canvas', { name: 'Project' }),
    command('create-structured-item', { type: 'milestone', title: 'MVP', workstream: 'engineering' }),
    command('create-structured-item', { type: 'story', title: 'User Auth', parent: 'M-001' }),
    command('create-structured-item', { type: 'task', title: 'Setup DB', parent: 'S-001' }),
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // Folder structure
    expectFileExists('milestones/.gitkeep'),
    expectFileExists('stories/.gitkeep'),
    expectFileExists('tasks/.gitkeep'),
    
    // Entity files
    expectFileExists('milestones/M-001_MVP.md'),
    expectFileExists('stories/S-001_User_Auth.md'),
    expectFileExists('tasks/T-001_Setup_DB.md'),
    
    // Hierarchy
    expectFrontmatter('stories/S-001_User_Auth.md', 'parent', 'M-001'),
    expectFrontmatter('tasks/T-001_Setup_DB.md', 'parent', 'S-001'),
    
    // Canvas nodes
    expectCanvasNode('M-001'),
    expectCanvasNode('S-001'),
    expectCanvasNode('T-001'),
    
    // Canvas edges (parent relationships)
    expectCanvasEdge('S-001', 'M-001'),
    expectCanvasEdge('T-001', 'S-001'),
    
    // Layout: T-001 LEFT of S-001 LEFT of M-001
    {
      check: 'position-left-of',
      leftNode: 'T-001',
      rightNode: 'S-001',
      description: 'T-001 positioned LEFT of S-001',
    },
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'M-001',
      description: 'S-001 positioned LEFT of M-001',
    },
  ],
});

