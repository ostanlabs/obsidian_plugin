import { ItemFrontmatter, FeatureFrontmatter } from "../types";

/**
 * Replace template placeholders with actual values
 */
export function replacePlaceholders(
	template: string,
	frontmatter: ItemFrontmatter
): string {
	let result = template;

	// Replace all frontmatter fields
	result = result.replace(/\{\{title\}\}/g, frontmatter.title);
	result = result.replace(/\{\{type\}\}/g, frontmatter.type);
	result = result.replace(/\{\{effort\}\}/g, frontmatter.effort);
	result = result.replace(/\{\{id\}\}/g, frontmatter.id);
	result = result.replace(/\{\{status\}\}/g, frontmatter.status);
	result = result.replace(/\{\{priority\}\}/g, frontmatter.priority);
	result = result.replace(/\{\{inProgress\}\}/g, String(frontmatter.inProgress ?? false));
	result = result.replace(/\{\{time_estimate\}\}/g, String(frontmatter.time_estimate ?? 0));
	result = result.replace(/\{\{depends_on\}\}/g, JSON.stringify(frontmatter.depends_on ?? []));
	result = result.replace(/\{\{created\}\}/g, frontmatter.created);
	result = result.replace(/\{\{updated\}\}/g, frontmatter.updated);
	result = result.replace(/\{\{created_by_plugin\}\}/g, String(frontmatter.created_by_plugin ?? true));
	result = result.replace(/\{\{canvas_source\}\}/g, frontmatter.canvas_source);
	result = result.replace(/\{\{vault_path\}\}/g, frontmatter.vault_path);
	result = result.replace(/\{\{notion_page_id\}\}/g, frontmatter.notion_page_id || "");

	return result;
}

/**
 * Replace feature template placeholders with actual values
 */
export function replaceFeaturePlaceholders(
	template: string,
	frontmatter: FeatureFrontmatter
): string {
	let result = template;

	// Replace all feature frontmatter fields
	result = result.replace(/\{\{id\}\}/g, frontmatter.id);
	result = result.replace(/\{\{type\}\}/g, frontmatter.type);
	result = result.replace(/\{\{title\}\}/g, frontmatter.title);
	result = result.replace(/\{\{workstream\}\}/g, frontmatter.workstream);
	result = result.replace(/\{\{user_story\}\}/g, frontmatter.user_story);
	result = result.replace(/\{\{tier\}\}/g, frontmatter.tier);
	result = result.replace(/\{\{phase\}\}/g, frontmatter.phase);
	result = result.replace(/\{\{status\}\}/g, frontmatter.status);
	result = result.replace(/\{\{priority\}\}/g, frontmatter.priority);
	result = result.replace(/\{\{personas\}\}/g, JSON.stringify(frontmatter.personas ?? []));
	result = result.replace(/\{\{acceptance_criteria\}\}/g, JSON.stringify(frontmatter.acceptance_criteria ?? []));
	result = result.replace(/\{\{test_refs\}\}/g, JSON.stringify(frontmatter.test_refs ?? []));
	result = result.replace(/\{\{implemented_by\}\}/g, JSON.stringify(frontmatter.implemented_by ?? []));
	result = result.replace(/\{\{documented_by\}\}/g, JSON.stringify(frontmatter.documented_by ?? []));
	result = result.replace(/\{\{decided_by\}\}/g, JSON.stringify(frontmatter.decided_by ?? []));
	result = result.replace(/\{\{depends_on\}\}/g, JSON.stringify(frontmatter.depends_on ?? []));
	result = result.replace(/\{\{blocks\}\}/g, JSON.stringify(frontmatter.blocks ?? []));
	result = result.replace(/\{\{last_updated\}\}/g, frontmatter.last_updated);
	result = result.replace(/\{\{created_at\}\}/g, frontmatter.created_at);
	result = result.replace(/\{\{created_by_plugin\}\}/g, String(frontmatter.created_by_plugin ?? true));

	return result;
}

/**
 * Default entity template
 */
export const DEFAULT_ACCOMPLISHMENT_TEMPLATE = `---
type: {{type}}
title: {{title}}
id: {{id}}
effort: {{effort}}
status: Not Started
priority: High
inProgress: false
time_estimate: 0
depends_on: []
created_by_plugin: true
created: {{created}}
updated: {{updated}}
canvas_source: {{canvas_source}}
vault_path: {{vault_path}}
notion_page_id: {{notion_page_id}}
---

# {{title}}

## Outcome

Describe the final state that will be true once this is done.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Tasks

### Task 1: [Name]
- **Goal:** [What this task achieves]
- **Estimate:** 0h
- **Status:** ⬜ Not Started
- **Notes:** [Implementation details]

### Task 2: [Name]
- **Goal:** [What this task achieves]
- **Estimate:** 0h
- **Status:** ⬜ Not Started
- **Notes:** [Implementation details]

## Notes

`;

/**
 * Default feature template (F-XXX)
 * Per FEATURE_ENTITY_SPEC.md
 */
export const DEFAULT_FEATURE_TEMPLATE = `---
id: {{id}}
type: feature
title: {{title}}
workstream: {{workstream}}

# Feature Classification
user_story: "{{user_story}}"
tier: {{tier}}
phase: {{phase}}
status: {{status}}
priority: {{priority}}

# Detail Fields
personas: {{personas}}
acceptance_criteria: {{acceptance_criteria}}
test_refs: {{test_refs}}

# Relationships
implemented_by: {{implemented_by}}
documented_by: {{documented_by}}
decided_by: {{decided_by}}
depends_on: {{depends_on}}
blocks: {{blocks}}

# Metadata
last_updated: {{last_updated}}
created_at: {{created_at}}
created_by_plugin: {{created_by_plugin}}
---

# {{id}}: {{title}}

## Description

[Detailed description of the feature]

## User Story

{{user_story}}

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Implementation Notes

[Technical notes, considerations]

## Related

- **Implements:** [links to milestones/stories]
- **Docs:** [links to documents]
- **Decisions:** [links to decisions]
- **Depends On:** [links to features]
- **Blocks:** [links to features]
`;
