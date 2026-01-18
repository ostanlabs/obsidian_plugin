import { ItemFrontmatter, FeatureFrontmatter, ItemStatus, ItemPriority, FeatureTier, FeaturePhase, FeatureStatus } from "../types";

/**
 * Parsed frontmatter with string index signature for dynamic access
 */
type ParsedFrontmatter = Record<string, string | string[] | boolean | number | undefined>;

/**
 * Generic frontmatter type that can be either ItemFrontmatter or FeatureFrontmatter
 */
export type GenericFrontmatter = ItemFrontmatter | FeatureFrontmatter;

/**
 * Parse a YAML value that might be a JSON array
 * e.g., '["ACC-001", "ACC-002"]' -> ["ACC-001", "ACC-002"]
 * Also handles YAML-style arrays: '[T-108]' or '[T-106, T-107]'
 */
function parseYamlValue(value: string): string | string[] | boolean | number {
	const trimmed = value.trim();

	// Try to parse as JSON array first
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed;
			}
		} catch {
			// Not valid JSON - try parsing as YAML-style array (unquoted values)
			// e.g., [T-108] or [T-106, T-107]
			const inner = trimmed.slice(1, -1).trim();
			if (inner === '') {
				return []; // Empty array
			}
			// Split by comma and trim each value
			const items = inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
			return items;
		}
	}

	return trimmed;
}

/**
 * Serialize a value for YAML frontmatter
 * Arrays are serialized as JSON: ["ACC-001", "ACC-002"]
 */
function serializeYamlValue(value: unknown): string {
	if (Array.isArray(value)) {
		return JSON.stringify(value);
	}
	return String(value);
}

/**
 * Parse raw frontmatter from a markdown file (returns ParsedFrontmatter)
 */
export function parseRawFrontmatter(content: string): ParsedFrontmatter | null {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(frontmatterRegex);

	if (!match) return null;

	const frontmatterText = match[1];
	const lines = frontmatterText.split("\n");
	const frontmatter: ParsedFrontmatter = {};

	for (const line of lines) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		const value = line.slice(colonIndex + 1).trim();

		frontmatter[key] = parseYamlValue(value);
	}

	// Convert boolean strings to actual booleans
	if (frontmatter.inProgress !== undefined && typeof frontmatter.inProgress === 'string') {
		frontmatter.inProgress = frontmatter.inProgress === "true";
	}
	if (frontmatter.created_by_plugin !== undefined && typeof frontmatter.created_by_plugin === 'string') {
		frontmatter.created_by_plugin = frontmatter.created_by_plugin === "true";
	}

	// Ensure array fields are always arrays if present
	const arrayFields = ['depends_on', 'blocks', 'implemented_by', 'documented_by', 'decided_by', 'personas', 'acceptance_criteria', 'test_refs'];
	for (const field of arrayFields) {
		if (frontmatter[field] !== undefined) {
			if (typeof frontmatter[field] === 'string') {
				const strVal = frontmatter[field] as string;
				frontmatter[field] = strVal ? [strVal] : [];
			} else if (!Array.isArray(frontmatter[field])) {
				frontmatter[field] = [];
			}
		}
	}

	return frontmatter;
}

/**
 * Parse frontmatter from a markdown file (for standard entities)
 */
export function parseFrontmatter(content: string): ItemFrontmatter | null {
	const frontmatter = parseRawFrontmatter(content);
	if (!frontmatter) return null;

	// Validate required fields for standard entities
	if (
		!frontmatter.type ||
		!frontmatter.title ||
		!frontmatter.id ||
		!frontmatter.effort
	) {
		return null;
	}

	return frontmatter as unknown as ItemFrontmatter;
}

/**
 * Parse frontmatter for any entity type (feature or standard)
 * Returns the raw parsed frontmatter with type field
 */
export function parseAnyFrontmatter(content: string): ParsedFrontmatter | null {
	const frontmatter = parseRawFrontmatter(content);
	if (!frontmatter) return null;

	// Validate minimal required fields
	if (!frontmatter.type || !frontmatter.title || !frontmatter.id) {
		return null;
	}

	return frontmatter;
}

/**
 * Parse frontmatter and body from a markdown file
 * Returns both frontmatter and body content separately
 */
export function parseFrontmatterAndBody(content: string): {
	frontmatter: ParsedFrontmatter;
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
	const frontmatter: ParsedFrontmatter = {};

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
 * @param updates Partial frontmatter updates (supports both ItemFrontmatter and FeatureFrontmatter fields)
 * @returns Updated markdown content
 */
export function updateFrontmatter(
	content: string,
	updates: Partial<ItemFrontmatter> | Partial<FeatureFrontmatter> | ParsedFrontmatter
): string {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
	const match = content.match(frontmatterRegex);

	let body = content;
	let existingFrontmatter: ParsedFrontmatter = {};

	if (match) {
		// Parse existing frontmatter
		const frontmatterText = match[1];
		const lines = frontmatterText.split("\n");

		for (const line of lines) {
			const colonIndex = line.indexOf(":");
			if (colonIndex === -1) continue;

			const key = line.slice(0, colonIndex).trim();
			const value = line.slice(colonIndex + 1).trim();

			existingFrontmatter[key] = parseYamlValue(value);
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
			// Handle arrays (like depends_on) - always include, even if empty
			if (Array.isArray(value)) {
				newFrontmatterLines.push(`${key}: ${JSON.stringify(value)}`);
			} else {
				newFrontmatterLines.push(`${key}: ${value}`);
			}
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
	const alwaysInclude = ['parent', 'notion_page_id', 'created_by_plugin', 'depends_on'];

	for (const [key, value] of Object.entries(frontmatter)) {
		// Handle arrays (like depends_on) - always include, even if empty
		if (Array.isArray(value)) {
			frontmatterLines.push(`${key}: ${JSON.stringify(value)}`);
		}
		// Always include certain fields, even if undefined/null/empty
		else if (alwaysInclude.includes(key)) {
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

	// Always include depends_on (empty array if no dependencies)
	lines.push(`depends_on: ${JSON.stringify(frontmatter.depends_on || [])}`);

	if (frontmatter.notion_page_id) {
		lines.push(`notion_page_id: ${frontmatter.notion_page_id}`);
	} else {
		lines.push(`notion_page_id:`);
	}

	lines.push("---");

	return lines.join("\n");
}

