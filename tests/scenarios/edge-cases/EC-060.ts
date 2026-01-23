import { defineScenario } from '../../framework';
import { command, expectCanvasNode } from '../../framework/fixtures';

/**
 * EC-060: Malformed YAML Frontmatter
 * Verifies handling of files with invalid YAML
 */
export default defineScenario({
  id: 'EC-060',
  name: 'Malformed YAML Frontmatter',
  category: 'edge-cases',
  description: 'Verify handling of files with invalid YAML frontmatter',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Valid.md',
        content: `---
id: M-001
type: milestone
title: Valid
workstream: engineering
---
# Valid`,
      },
      {
        path: 'milestones/M-002_Invalid.md',
        content: `---
id: M-002
type: milestone
title: Invalid YAML
  bad indentation: here
workstream: engineering
---
# Invalid YAML`,
      },
      {
        path: 'milestones/M-003_NoFrontmatter.md',
        content: `# No Frontmatter
Just content, no YAML block`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001 valid, M-002 malformed YAML, M-003 no frontmatter',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Valid file processed
    expectCanvasNode('M-001'),
    // Invalid YAML skipped
    {
      check: 'canvas-node-not-exists',
      nodeId: 'M-002',
      description: 'M-002 not on canvas (malformed YAML)',
    },
    // No frontmatter skipped
    {
      check: 'canvas-node-not-exists',
      nodeId: 'M-003',
      description: 'M-003 not on canvas (no frontmatter)',
    },
    // Warning about skipped files
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'Skipped 2 files',
      description: 'Warning about skipped files',
    },
    {
      check: 'notice-contains',
      contains: ['M-002_Invalid.md', 'malformed YAML'],
      description: 'Warning mentions malformed YAML',
    },
    // No crash
    {
      check: 'no-error-notice',
      description: 'No crash or error dialog',
    },
  ],
});

