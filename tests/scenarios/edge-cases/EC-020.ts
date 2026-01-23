/**
 * EC-020: Create Entity with Special Characters in Title
 * 
 * Tests that special characters in titles are handled correctly.
 * Verifies filename sanitization while preserving title in frontmatter.
 */

import { defineScenario } from '../../framework';
import {
  command,
  expectFileExists,
  expectFrontmatter,
} from '../../framework/fixtures';

export default defineScenario({
  id: 'EC-020',
  name: 'Create Entity with Special Characters in Title',
  category: 'edge-case',
  description: 'User creates an entity with special characters that need sanitization',
  
  preconditions: {
    folders: ['tasks'],
  },
  
  steps: [
    command('create-structured-item', {
      type: 'task',
      title: 'Fix bug: API returns 500 (urgent!)',
      workstream: 'engineering',
    }),
  ],
  
  expectations: [
    // File should be created with sanitized filename
    expectFileExists('tasks/T-001_Fix_bug__API_returns_500__urgent__.md'),
    
    // ID should be generated
    expectFrontmatter('tasks/T-001_Fix_bug__API_returns_500__urgent__.md', 'id', 'T-001'),
    
    // Original title should be preserved in frontmatter
    expectFrontmatter(
      'tasks/T-001_Fix_bug__API_returns_500__urgent__.md',
      'title',
      'Fix bug: API returns 500 (urgent!)'
    ),
  ],
});

