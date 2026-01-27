import { defineScenario } from '../../framework';
import { milestone, story, command } from '../../framework/fixtures';

/**
 * EC-033: Child Inherits Parent Workstream
 * Verifies children without workstream inherit from parent
 */
export default defineScenario({
  id: 'EC-033',
  name: 'Child Inherits Parent Workstream',
  category: 'edge-cases',
  description: 'Verify children without workstream are placed in parent workstream lane',

  preconditions: {
    entities: [
      milestone('M-001', { title: 'Engineering Milestone', workstream: 'engineering' }),
      milestone('M-002', { title: 'Business Milestone', workstream: 'business' }),
      // Stories without workstream
      story('S-001', { title: 'Story under Engineering', parent: 'M-001' }),
      story('S-002', { title: 'Story under Business', parent: 'M-002' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 engineering, M-002 business, S-001/S-002 no workstream but have parents',
  },

  steps: [
    command('populate-canvas', {}),
    command('reposition-nodes', {}),
  ],

  expectations: [
    // S-001 in engineering lane (inherited from M-001)
    {
      check: 'same-workstream-lane',
      nodes: ['M-001', 'S-001'],
      description: 'S-001 in same lane as M-001 (engineering)',
    },
    // S-002 in business lane (inherited from M-002)
    {
      check: 'same-workstream-lane',
      nodes: ['M-002', 'S-002'],
      description: 'S-002 in same lane as M-002 (business)',
    },
    // Different lanes for different workstreams
    {
      check: 'different-workstream-lanes',
      nodes: ['S-001', 'S-002'],
      description: 'S-001 and S-002 in different lanes',
    },
    // Children LEFT of parents
    {
      check: 'position-left-of',
      leftNode: 'S-001',
      rightNode: 'M-001',
      description: 'S-001 LEFT of M-001',
    },
    {
      check: 'position-left-of',
      leftNode: 'S-002',
      rightNode: 'M-002',
      description: 'S-002 LEFT of M-002',
    },
  ],
});

