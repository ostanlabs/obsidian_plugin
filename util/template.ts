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
	result = result.replace(/\{\{parent\}\}/g, frontmatter.parent || "");
	result = result.replace(/\{\{status\}\}/g, frontmatter.status);
	result = result.replace(/\{\{priority\}\}/g, frontmatter.priority);
	result = result.replace(/\{\{created\}\}/g, frontmatter.created);
	result = result.replace(/\{\{updated\}\}/g, frontmatter.updated);
	result = result.replace(/\{\{canvas_source\}\}/g, frontmatter.canvas_source);
	result = result.replace(/\{\{vault_path\}\}/g, frontmatter.vault_path);
	result = result.replace(/\{\{notion_page_id\}\}/g, frontmatter.notion_page_id || "");

	return result;
}

/**
 * Default task template
 */
export const DEFAULT_TASK_TEMPLATE = `---
type: {{type}}
title: {{title}}
effort: {{effort}}
id: {{id}}
parent: {{parent}}
status: todo
priority: medium
created: {{created}}
updated: {{updated}}
canvas_source: {{canvas_source}}
vault_path: {{vault_path}}
notion_page_id: {{notion_page_id}}
---

# {{title}} (Task)

## Objective

Describe what needs to be achieved.

## Steps

- [ ] Step 1
- [ ] Step 2

## Notes

- ...
`;

/**
 * Default accomplishment template
 */
export const DEFAULT_ACCOMPLISHMENT_TEMPLATE = `---
type: {{type}}
title: {{title}}
effort: {{effort}}
id: {{id}}
status: todo
priority: high
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

## Related Tasks

- [ ] Link tasks here

## Notes

- ...
`;

