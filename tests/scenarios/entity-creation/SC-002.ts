/**
 * SC-002: Create Story Under Milestone
 * 
 * Tests story creation with parent milestone relationship.
 * Verifies parent field is set and hierarchy is established.
 */

import { defineScenario } from '../../framework';
import {
  milestone,
  command,
  expectFileExists,
  expectFrontmatter,
} from '../../framework/fixtures';

export default defineScenario({
  id: 'SC-002',
  name: 'Create Story Under Milestone',
  category: 'entity-creation',
  description: 'User creates a story and assigns it to an existing milestone',
  
  preconditions: {
    folders: ['milestones', 'stories'],
    entities: [
      milestone('M-001', 'Q2 Product Launch'),
    ],
  },
  
  steps: [
    command('create-structured-item', {
      type: 'story',
      title: 'User Authentication Flow',
      workstream: 'engineering',
      parent: 'M-001',
    }),
  ],
  
  expectations: [
    // File should be created
    expectFileExists('stories/S-001_User_Authentication_Flow.md'),
    
    // ID should be auto-generated as S-001
    expectFrontmatter('stories/S-001_User_Authentication_Flow.md', 'id', 'S-001'),
    
    // Type should be story
    expectFrontmatter('stories/S-001_User_Authentication_Flow.md', 'type', 'story'),
    
    // Parent should reference the milestone
    expectFrontmatter('stories/S-001_User_Authentication_Flow.md', 'parent', 'M-001'),
    
    // Title should match
    expectFrontmatter('stories/S-001_User_Authentication_Flow.md', 'title', 'User Authentication Flow'),
  ],
});

