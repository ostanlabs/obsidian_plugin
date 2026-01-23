import { defineScenario } from '../../framework';
import { command, expectCanvasNode, expectFrontmatter } from '../../framework/fixtures';

/**
 * EC-062: Unicode in Frontmatter
 * Verifies handling of unicode characters in frontmatter values
 */
export default defineScenario({
  id: 'EC-062',
  name: 'Unicode in Frontmatter',
  category: 'edge-cases',
  description: 'Verify handling of unicode characters in frontmatter values',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Unicode.md',
        content: `---
id: M-001
type: milestone
title: "日本語タイトル 🚀"
workstream: engineering
description: "Émojis: 🎉 and accents: café, naïve"
---
# 日本語タイトル 🚀`,
      },
      {
        path: 'stories/S-001_Chinese.md',
        content: `---
id: S-001
type: story
title: "中文标题"
parent: M-001
---
# 中文标题`,
      },
      {
        path: 'tasks/T-001_Arabic.md',
        content: `---
id: T-001
type: task
title: "عنوان عربي"
parent: S-001
---
# عنوان عربي`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Files with Japanese, Chinese, Arabic, and emoji in titles',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // All nodes on canvas
    expectCanvasNode('M-001'),
    expectCanvasNode('S-001'),
    expectCanvasNode('T-001'),
    // Unicode preserved in frontmatter
    expectFrontmatter('milestones/M-001_Unicode.md', 'title', '日本語タイトル 🚀'),
    expectFrontmatter('stories/S-001_Chinese.md', 'title', '中文标题'),
    expectFrontmatter('tasks/T-001_Arabic.md', 'title', 'عنوان عربي'),
    // Canvas node labels show unicode
    {
      check: 'canvas-node-label-contains',
      nodeId: 'M-001',
      contains: '日本語',
      description: 'M-001 label shows Japanese text',
    },
    // No encoding errors
    {
      check: 'no-error-notice',
      description: 'No encoding errors',
    },
  ],
});

