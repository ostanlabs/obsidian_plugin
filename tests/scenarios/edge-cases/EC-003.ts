import { defineScenario } from '../../framework';
import { milestone, command, expectFileExists, expectFrontmatter } from '../../framework/fixtures';

/**
 * EC-003: ID with Leading Zeros
 * Verifies IDs with leading zeros are preserved correctly
 */
export default defineScenario({
  id: 'EC-003',
  name: 'ID with Leading Zeros',
  category: 'edge-cases',
  description: 'Verify IDs with leading zeros (M-001) are preserved, not converted to M-1',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'First', workstream: 'engineering' }),
      milestone('M-010', { title: 'Tenth', workstream: 'engineering' }),
      milestone('M-100', { title: 'Hundredth', workstream: 'engineering' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Milestones M-001, M-010, M-100 exist',
  },

  steps: [
    command('create-structured-item', {
      type: 'milestone',
      title: 'New Milestone',
      workstream: 'engineering',
    }),
  ],

  expectations: [
    // New ID is M-101 (not M-2 or M-11)
    expectFileExists('milestones/M-101_New_Milestone.md'),
    expectFrontmatter('milestones/M-101_New_Milestone.md', 'id', 'M-101'),
    // Existing IDs preserved
    expectFrontmatter('milestones/M-001_First.md', 'id', 'M-001'),
    expectFrontmatter('milestones/M-010_Tenth.md', 'id', 'M-010'),
    expectFrontmatter('milestones/M-100_Hundredth.md', 'id', 'M-100'),
    // ID generation uses max numeric value
    {
      check: 'id-generation-logic',
      existingIds: ['M-001', 'M-010', 'M-100'],
      expectedNext: 'M-101',
      description: 'ID generation finds max numeric (100) and adds 1',
    },
  ],
});

