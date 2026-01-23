import { defineScenario } from '../../framework';
import { milestone, story, command, expectFileExists, expectFrontmatter } from '../../framework/fixtures';

/**
 * EC-052: Archive Entity with Dependencies
 * Verifies archiving entity with dependencies updates dependent entities
 */
export default defineScenario({
  id: 'EC-052',
  name: 'Archive Entity with Dependencies',
  category: 'edge-cases',
  description: 'Verify archiving entity that blocks others shows warning',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'Blocker', workstream: 'engineering', archived: true, blocks: ['M-002', 'M-003'] }),
      milestone('M-002', { title: 'Blocked 1', workstream: 'engineering', depends_on: ['M-001'] }),
      milestone('M-003', { title: 'Blocked 2', workstream: 'engineering', depends_on: ['M-001'] }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 archived, blocks M-002 and M-003',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // M-001 archived
    expectFileExists('archive/milestones/M-001_Blocker.md'),
    // M-002 and M-003 still active
    expectFileExists('milestones/M-002_Blocked_1.md'),
    expectFileExists('milestones/M-003_Blocked_2.md'),
    // Warning about broken dependencies
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Archived entity blocks active entities',
      description: 'Warning about broken dependency chain',
    },
    {
      check: 'notice-contains',
      contains: ['M-002', 'M-003'],
      description: 'Warning lists affected entities',
    },
    // depends_on preserved (not auto-cleared)
    expectFrontmatter('milestones/M-002_Blocked_1.md', 'depends_on', ['M-001']),
    expectFrontmatter('milestones/M-003_Blocked_2.md', 'depends_on', ['M-001']),
  ],
});

