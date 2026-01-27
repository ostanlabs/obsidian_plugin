import { defineScenario } from '../../framework';
import { command, expectCanvasNode, expectFrontmatter } from '../../framework/fixtures';

/**
 * EC-063: Special Characters in Frontmatter
 * Verifies handling of YAML special characters (colons, quotes, etc.)
 */
export default defineScenario({
  id: 'EC-063',
  name: 'Special Characters in Frontmatter',
  category: 'edge-cases',
  description: 'Verify handling of YAML special characters in frontmatter values',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Special.md',
        content: `---
id: M-001
type: milestone
title: "Title with: colon"
workstream: engineering
description: "Quotes: 'single' and \"double\""
---
# Title with: colon`,
      },
      {
        path: 'stories/S-001_Brackets.md',
        content: `---
id: S-001
type: story
title: "Title [with] {brackets}"
parent: M-001
---
# Title [with] {brackets}`,
      },
      {
        path: 'tasks/T-001_Ampersand.md',
        content: `---
id: T-001
type: task
title: "Title & ampersand"
parent: S-001
---
# Title & ampersand`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Files with colons, quotes, brackets, ampersands in titles',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // All nodes on canvas
    expectCanvasNode('M-001'),
    expectCanvasNode('S-001'),
    expectCanvasNode('T-001'),
    // Special characters preserved
    expectFrontmatter('milestones/M-001_Special.md', 'title', 'Title with: colon'),
    expectFrontmatter('stories/S-001_Brackets.md', 'title', 'Title [with] {brackets}'),
    expectFrontmatter('tasks/T-001_Ampersand.md', 'title', 'Title & ampersand'),
    // No YAML parsing errors
    {
      check: 'no-error-notice',
      description: 'No YAML parsing errors',
    },
  ],
});

