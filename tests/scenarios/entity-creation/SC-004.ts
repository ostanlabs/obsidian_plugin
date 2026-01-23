import { defineScenario } from '../../framework';
import { story, document as doc, command, expectFileExists, expectFrontmatter, expectCanvasNode, expectCanvasEdge } from '../../framework/fixtures';

/**
 * SC-004: Create Decision Affecting Multiple Entities
 * Verifies decision creation with affects relationship to multiple entities
 */
export default defineScenario({
  id: 'SC-004',
  name: 'Create Decision Affecting Multiple Entities',
  category: 'entity-creation',
  description: 'Verify decision creation with affects relationship to story and document',

  preconditions: {
    entities: [
      story('S-015', { title: 'Database Layer' }),
      doc('DOC-005', { title: 'Database Schema' }),
    ],
    canvas: { nodes: [], edges: [] },
    description: 'S-015 and DOC-005 exist on canvas',
  },

  steps: [
    command('create-structured-item', {
      type: 'decision',
      title: 'Use PostgreSQL',
      affects: ['S-015', 'DOC-005'],
      status: 'Decided',
    }),
  ],

  expectations: [
    expectFileExists('decisions/DEC-001_Use_PostgreSQL.md'),
    expectFrontmatter('decisions/DEC-001_Use_PostgreSQL.md', 'status', 'Decided'),
    {
      check: 'frontmatter-array-equals',
      path: 'decisions/DEC-001_Use_PostgreSQL.md',
      field: 'affects',
      expected: ['S-015', 'DOC-005'],
      description: 'affects field contains both entities',
    },
    expectCanvasNode('DEC-001'),
    expectCanvasEdge('DEC-001', 'S-015'),
    expectCanvasEdge('DEC-001', 'DOC-005'),
    {
      check: 'frontmatter-field-not-exists',
      path: 'stories/S-015_Database_Layer.md',
      field: 'affected_by',
      description: 'S-015 does NOT have affected_by field (no reverse sync)',
    },
    {
      check: 'position-near',
      nodeId: 'DEC-001',
      nearNode: 'S-015',
      description: 'Decision positioned near first affected entity',
    },
  ],
});

