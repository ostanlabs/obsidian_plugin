import { defineScenario } from '../../framework';
import { document as doc, command, expectFileExists, expectFrontmatter } from '../../framework/fixtures';

/**
 * SC-005: Create Document with Version Chain
 * Verifies document creation with previous_version linking
 */
export default defineScenario({
  id: 'SC-005',
  name: 'Create Document with Version Chain',
  category: 'entity-creation',
  description: 'Verify document creation with previous_version creates bidirectional version chain',

  preconditions: {
    entities: [
      doc('DOC-004', { title: 'API Spec v1', next_version: null }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'DOC-004 exists with next_version: null',
  },

  steps: [
    command('create-structured-item', {
      type: 'document',
      title: 'API Spec v2',
      previous_version: 'DOC-004',
    }),
  ],

  expectations: [
    expectFileExists('documents/DOC-005_API_Spec_v2.md'),
    expectFrontmatter('documents/DOC-005_API_Spec_v2.md', 'previous_version', 'DOC-004'),
    expectFrontmatter('documents/DOC-004_API_Spec_v1.md', 'next_version', 'DOC-005'),
    {
      check: 'version-chain-navigable',
      from: 'DOC-004',
      to: 'DOC-005',
      description: 'Can navigate DOC-004 → DOC-005 → DOC-004',
    },
  ],
});

