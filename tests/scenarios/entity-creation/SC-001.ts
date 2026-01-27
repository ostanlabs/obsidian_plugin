/**
 * SC-001: Create Milestone with Target Date
 * 
 * Tests basic milestone creation through the plugin command.
 * Verifies file creation, ID generation, and frontmatter structure.
 */

import { defineScenario } from '../../framework';
import {
  milestone,
  command,
  expectFileExists,
  expectFrontmatter,
} from '../../framework/fixtures';

export default defineScenario({
  id: 'SC-001',
  name: 'Create Milestone with Target Date',
  category: 'entity-creation',
  description: 'User creates a new milestone using the create-structured-item command',
  
  preconditions: {
    folders: ['milestones'],
    entities: [
      milestone('M-001', 'Existing Milestone 1'),
      milestone('M-002', 'Existing Milestone 2'),
    ],
  },
  
  steps: [
    command('create-structured-item', {
      type: 'milestone',
      title: 'Q2 Product Launch',
      workstream: 'engineering',
    }),
  ],
  
  expectations: [
    // File should be created with correct naming
    expectFileExists('milestones/M-003_Q2_Product_Launch.md'),
    
    // ID should be auto-generated as M-003
    expectFrontmatter('milestones/M-003_Q2_Product_Launch.md', 'id', 'M-003'),
    
    // Type should be milestone
    expectFrontmatter('milestones/M-003_Q2_Product_Launch.md', 'type', 'milestone'),
    
    // Title should match input
    expectFrontmatter('milestones/M-003_Q2_Product_Launch.md', 'title', 'Q2 Product Launch'),
    
    // Default status should be Not Started
    expectFrontmatter('milestones/M-003_Q2_Product_Launch.md', 'status', 'Not Started'),
    
    // Workstream should match input
    expectFrontmatter('milestones/M-003_Q2_Product_Launch.md', 'workstream', 'engineering'),
  ],
});

