import { defineScenario } from '../../framework';
import { command, expectCanvasNode, expectFrontmatter } from '../../framework/fixtures';

/**
 * EC-064: Extra/Unknown Frontmatter Fields
 * Verifies unknown fields are preserved, not deleted
 */
export default defineScenario({
  id: 'EC-064',
  name: 'Extra/Unknown Frontmatter Fields',
  category: 'edge-cases',
  description: 'Verify unknown frontmatter fields are preserved when file is updated',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Extra.md',
        content: `---
id: M-001
type: milestone
title: Extra Fields
workstream: engineering
custom_field: custom value
my_tags:
  - tag1
  - tag2
legacy_id: OLD-123
notion_url: https://notion.so/page
---
# Extra Fields`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 has custom_field, my_tags, legacy_id, notion_url (non-standard fields)',
  },

  steps: [
    command('populate-canvas', {}),
    command('update-frontmatter', {
      path: 'milestones/M-001_Extra.md',
      frontmatter: { status: 'In Progress' },
    }),
  ],

  expectations: [
    // Node on canvas
    expectCanvasNode('M-001'),
    // Standard fields work
    expectFrontmatter('milestones/M-001_Extra.md', 'status', 'In Progress'),
    // Custom fields preserved
    expectFrontmatter('milestones/M-001_Extra.md', 'custom_field', 'custom value'),
    expectFrontmatter('milestones/M-001_Extra.md', 'legacy_id', 'OLD-123'),
    expectFrontmatter('milestones/M-001_Extra.md', 'notion_url', 'https://notion.so/page'),
    // Array field preserved
    {
      check: 'frontmatter-array-equals',
      path: 'milestones/M-001_Extra.md',
      field: 'my_tags',
      expected: ['tag1', 'tag2'],
      description: 'my_tags array preserved',
    },
    // No warning about unknown fields
    {
      check: 'no-warning-about',
      message: 'unknown field',
      description: 'No warning about unknown fields',
    },
  ],
});

