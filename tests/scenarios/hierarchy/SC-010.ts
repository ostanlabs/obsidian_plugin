/**
 * SC-010: Add Dependency Between Tasks
 * 
 * Tests adding a dependency relationship between two tasks.
 * Verifies depends_on and blocks arrays are updated correctly.
 */

import { defineScenario } from '../../framework';
import {
  task,
  editFile,
  expectFrontmatter,
  expectArrayContains,
} from '../../framework/fixtures';

export default defineScenario({
  id: 'SC-010',
  name: 'Add Dependency Between Tasks',
  category: 'hierarchy',
  description: 'User adds a dependency where T-002 depends on T-001',
  
  preconditions: {
    folders: ['tasks'],
    entities: [
      task('T-001', 'Setup Database Schema'),
      task('T-002', 'Implement User Model'),
    ],
  },
  
  steps: [
    // Edit T-002 to add dependency on T-001
    editFile('tasks/T-002_Implement_User_Model.md', {
      frontmatter: {
        depends_on: ['T-001'],
      },
    }),
  ],
  
  expectations: [
    // T-002 should have T-001 in depends_on
    expectArrayContains('tasks/T-002_Implement_User_Model.md', 'depends_on', 'T-001'),
    
    // Verify the full depends_on array
    expectFrontmatter('tasks/T-002_Implement_User_Model.md', 'depends_on', ['T-001']),
  ],
});

