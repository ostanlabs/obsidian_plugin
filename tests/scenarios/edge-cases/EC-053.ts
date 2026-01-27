import { defineScenario } from '../../framework';
import { command, expectFileExists } from '../../framework/fixtures';

/**
 * EC-053: Nested Archive Folder Structure
 * Verifies archive preserves original folder structure
 */
export default defineScenario({
  id: 'EC-053',
  name: 'Nested Archive Folder Structure',
  category: 'edge-cases',
  description: 'Verify archive preserves original folder structure (milestones/, stories/, etc.)',

  preconditions: {
    entities: [],
    files: [
      {
        path: 'milestones/M-001_Milestone.md',
        content: `---
id: M-001
type: milestone
title: Milestone
workstream: engineering
archived: true
---
# Milestone`,
      },
      {
        path: 'stories/S-001_Story.md',
        content: `---
id: S-001
type: story
title: Story
archived: true
---
# Story`,
      },
      {
        path: 'tasks/T-001_Task.md',
        content: `---
id: T-001
type: task
title: Task
archived: true
---
# Task`,
      },
      {
        path: 'decisions/DEC-001_Decision.md',
        content: `---
id: DEC-001
type: decision
title: Decision
archived: true
---
# Decision`,
      },
    ],
    canvas: { nodes: [], edges: [] },
    description: 'Entities in different folders all have archived: true',
  },

  steps: [
    command('populate-canvas', {}),
  ],

  expectations: [
    // Each type in correct archive subfolder
    expectFileExists('archive/milestones/M-001_Milestone.md'),
    expectFileExists('archive/stories/S-001_Story.md'),
    expectFileExists('archive/tasks/T-001_Task.md'),
    expectFileExists('archive/decisions/DEC-001_Decision.md'),
    // Original locations empty
    {
      check: 'file-not-exists',
      path: 'milestones/M-001_Milestone.md',
      description: 'Original milestone location empty',
    },
    {
      check: 'file-not-exists',
      path: 'stories/S-001_Story.md',
      description: 'Original story location empty',
    },
    {
      check: 'file-not-exists',
      path: 'tasks/T-001_Task.md',
      description: 'Original task location empty',
    },
    {
      check: 'file-not-exists',
      path: 'decisions/DEC-001_Decision.md',
      description: 'Original decision location empty',
    },
    // Archive folder structure
    expectFileExists('archive/milestones/.gitkeep'),
    expectFileExists('archive/stories/.gitkeep'),
    expectFileExists('archive/tasks/.gitkeep'),
    expectFileExists('archive/decisions/.gitkeep'),
  ],
});

