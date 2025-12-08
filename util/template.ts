import { ItemFrontmatter } from "../types";

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
 * Default accomplishment template
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

# {{title}} (Accomplishment)

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

