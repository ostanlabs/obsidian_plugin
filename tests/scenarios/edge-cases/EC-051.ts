import { defineScenario } from '../../framework';
import { command, expectFileExists } from '../../framework/fixtures';

/**
 * EC-051: Archive File Name Collision
 * Verifies handling when archived file name already exists in archive
 */
export default defineScenario({
  id: 'EC-051',
  name: 'Archive File Name Collision',
  category: 'edge-cases',
  description: 'Verify handling when archived file name already exists in archive folder',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Duplicate.md',
        content: `---
id: M-001
type: milestone
title: Duplicate
workstream: engineering
archived: true
---
# New version to archive`,
      },
      {
        path: 'archive/milestones/M-001_Duplicate.md',
        content: `---
id: M-001-old
type: milestone
title: Duplicate
workstream: engineering
archived: true
---
# Old version already in archive`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'M-001_Duplicate.md exists in both milestones/ and archive/milestones/',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // New file renamed to avoid collision
    {
      check: 'file-not-exists',
      path: 'milestones/M-001_Duplicate.md',
      description: 'Original file moved',
    },
    // Old file preserved
    expectFileExists('archive/milestones/M-001_Duplicate.md'),
    // New file renamed
    {
      check: 'file-exists-pattern',
      pattern: 'archive/milestones/M-001_Duplicate_*.md',
      description: 'New file renamed with suffix',
    },
    // Warning about collision
    {
      check: 'notice-shown',
      type: 'warning',
      message: 'File renamed to avoid collision',
      description: 'Warning about file rename',
    },
    // Both files preserved
    {
      check: 'file-count-in-folder',
      folder: 'archive/milestones',
      expected: 2,
      description: 'Both files exist in archive',
    },
  ],
});

