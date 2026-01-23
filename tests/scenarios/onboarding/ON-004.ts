import { defineScenario } from '../../framework';
import { command, expectFileExists, expectFrontmatter } from '../../framework/fixtures';

/**
 * ON-004: Create First Milestone (Empty Project)
 * Verifies first milestone creation with correct ID assignment
 */
export default defineScenario({
  id: 'ON-004',
  name: 'Create First Milestone (Empty Project)',
  category: 'onboarding',
  description: 'Verify first milestone gets ID M-001 in empty project',

  preconditions: {
    entities: [],
    canvas: null,
    description: 'Plugin installed, no existing entities in vault',
  },

  steps: [
    command('create-structured-item', {
      type: 'milestone',
      title: 'MVP Release',
      workstream: 'engineering',
    }),
  ],

  expectations: [
    expectFileExists('milestones/M-001_MVP_Release.md'),
    expectFrontmatter('milestones/M-001_MVP_Release.md', 'id', 'M-001'),
    expectFrontmatter('milestones/M-001_MVP_Release.md', 'type', 'milestone'),
    expectFrontmatter('milestones/M-001_MVP_Release.md', 'status', 'Not Started'),
    expectFrontmatter('milestones/M-001_MVP_Release.md', 'workstream', 'engineering'),
    {
      check: 'frontmatter-exists',
      path: 'milestones/M-001_MVP_Release.md',
      field: 'created_at',
      description: 'created_at timestamp is set',
    },
    {
      check: 'folder-created',
      path: 'milestones',
      description: 'milestones folder created if it did not exist',
    },
  ],
});

