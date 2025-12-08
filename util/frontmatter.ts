import { ItemFrontmatter, ItemStatus, ItemPriority } from "../types";

/**
 * Parse frontmatter from a markdown file
 */
export function parseFrontmatter(content: string): ItemFrontmatter | null {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(frontmatterRegex);

	if (!match) return null;

	const frontmatterText = match[1];
	const lines = frontmatterText.split("\n");
	const frontmatter: any = {};

	for (const line of lines) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		const value = line.slice(colonIndex + 1).trim();

		frontmatter[key] = value;
	}

	// Validate required fields
	if (
		!frontmatter.type ||
		!frontmatter.title ||
		!frontmatter.id ||
		!frontmatter.effort
	) {
		return null;
	}

	// Convert boolean strings to actual booleans
	if (frontmatter.inProgress !== undefined) {
		frontmatter.inProgress = frontmatter.inProgress === "true";
	}
	if (frontmatter.created_by_plugin !== undefined) {
		frontmatter.created_by_plugin = frontmatter.created_by_plugin === "true";
	}

	return frontmatter as ItemFrontmatter;
}

/**
 * Parse frontmatter and body from a markdown file
 * Returns both frontmatter and body content separately
 */
export function parseFrontmatterAndBody(content: string): {
	frontmatter: any;
	body: string;
} {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return {
			frontmatter: {},
			body: content,
		};
	}

	const frontmatterText = match[1];
	const lines = frontmatterText.split("\n");
	const frontmatter: any = {};

	for (const line of lines) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		const value = line.slice(colonIndex + 1).trim();

		frontmatter[key] = value;
	}

	// Extract body (everything after frontmatter)
	const body = content.substring(match[0].length);

	return {
		frontmatter,
		body,
	};
}

/**
 * Update frontmatter in a markdown file
 * @param content Full markdown content including frontmatter
 * @param updates Partial frontmatter updates
 * @returns Updated markdown content
 */
export function updateFrontmatter(
	content: string,
	updates: Partial<ItemFrontmatter>
): string {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
	const match = content.match(frontmatterRegex);

	let body = content;
	let existingFrontmatter: any = {};

	if (match) {
		// Parse existing frontmatter
		const frontmatterText = match[1];
		const lines = frontmatterText.split("\n");

		for (const line of lines) {
			const colonIndex = line.indexOf(":");
			if (colonIndex === -1) continue;

			const key = line.slice(0, colonIndex).trim();
			const value = line.slice(colonIndex + 1).trim();

			existingFrontmatter[key] = value;
		}

		// Extract body
		body = content.substring(match[0].length);
	}

	// Merge updates
	const mergedFrontmatter = { ...existingFrontmatter, ...updates };

	// Serialize new frontmatter
	const newFrontmatterLines: string[] = ["---"];
	for (const [key, value] of Object.entries(mergedFrontmatter)) {
		if (value !== undefined && value !== null) {
			newFrontmatterLines.push(`${key}: ${value}`);
		}
	}
	newFrontmatterLines.push("---");

	return newFrontmatterLines.join("\n") + "\n" + body;
}

/**
 * Create content with frontmatter from body only
 * @param body Markdown body without frontmatter
 * @param frontmatter Frontmatter object
 * @returns Full markdown content with frontmatter
 */
export function createWithFrontmatter(body: string, frontmatter: Partial<ItemFrontmatter>): string {
	const frontmatterLines: string[] = ["---"];
	
	// Define required fields that should always be written (even if empty)
	const alwaysInclude = ['parent', 'notion_page_id', 'created_by_plugin'];
	
	for (const [key, value] of Object.entries(frontmatter)) {
		// Always include certain fields, even if undefined/null/empty
		if (alwaysInclude.includes(key)) {
			if (value === undefined || value === null || value === "") {
				frontmatterLines.push(`${key}:`); // Empty value
			} else {
				frontmatterLines.push(`${key}: ${value}`);
			}
		}
		// Skip other undefined, null, or empty string values
		else if (value !== undefined && value !== null && value !== "") {
			// Properly quote strings that contain special characters
			const stringValue = String(value);
			if (stringValue.includes(':') || stringValue.includes('#') || stringValue.includes('\n')) {
				frontmatterLines.push(`${key}: "${stringValue}"`);
			} else {
				frontmatterLines.push(`${key}: ${stringValue}`);
			}
		}
	}
	frontmatterLines.push("---");

	return frontmatterLines.join("\n") + "\n" + body;
}

/**
 * Serialize frontmatter object to YAML string
 */
export function serializeFrontmatter(frontmatter: ItemFrontmatter): string {
	const lines: string[] = ["---"];

	lines.push(`type: ${frontmatter.type}`);
	lines.push(`title: ${frontmatter.title}`);
	lines.push(`id: ${frontmatter.id}`);
	lines.push(`effort: ${frontmatter.effort}`);

	lines.push(`status: ${frontmatter.status}`);
	lines.push(`priority: ${frontmatter.priority}`);
	lines.push(`inProgress: ${frontmatter.inProgress ?? false}`);
	lines.push(`created_by_plugin: ${frontmatter.created_by_plugin ?? true}`);
	lines.push(`created: ${frontmatter.created}`);
	lines.push(`updated: ${frontmatter.updated}`);
	lines.push(`canvas_source: ${frontmatter.canvas_source}`);
	lines.push(`vault_path: ${frontmatter.vault_path}`);

	if (frontmatter.notion_page_id) {
		lines.push(`notion_page_id: ${frontmatter.notion_page_id}`);
	} else {
		lines.push(`notion_page_id:`);
	}

	lines.push("---");

	return lines.join("\n");
}

