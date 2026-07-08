import { App, normalizePath } from "obsidian";
import { ItemFrontmatter } from "../types";
import { buildEntityFilename } from "../src/entity-core/path-resolver";
import { DEFAULT_SCHEMA } from "../src/entity-core/default-schema";

/**
 * Convert a string to snake_case
 */
export function toSnakeCase(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/[^\w\s-]/g, "") // Remove special characters
		.replace(/[\s-]+/g, "_") // Replace spaces and hyphens with underscores
		.replace(/_+/g, "_") // Replace multiple underscores with single
		.replace(/^_+|_+$/g, ""); // Trim underscores from start/end
}

/**
 * Sanitize a filename by removing/replacing invalid characters
 * Preserves whitespaces and most characters, only removes truly invalid ones
 */
export function sanitizeFilename(filename: string): string {
	// Remove characters that are invalid in filenames across platforms
	// Keep whitespaces, letters, numbers, hyphens, underscores, and most punctuation
	return filename
		.replace(/[\\/:*?"<>|]/g, "-") // Replace invalid chars with hyphen
		.replace(/-+/g, "-") // Collapse multiple hyphens
		.replace(/^-+|-+$/g, "") // Trim hyphens from start/end
		.trim();
}

/**
 * Generate the canonical entity filename, derived from the active schema's
 * filename settings (DEFAULT_SCHEMA.settings) via the shared buildEntityFilename
 * builder — so the plugin and the MCP PathResolver produce IDENTICAL filenames
 * for the same input. Canonical convention: TITLE-ONLY, PRESERVE-case
 * (e.g. "Add 90-day retention policy" → "Add_90-day_retention_policy.md").
 */
export function generateEntityFilename(id: string, title: string): string {
	return buildEntityFilename(
		id,
		title,
		DEFAULT_SCHEMA.settings.filenamePattern,
		DEFAULT_SCHEMA.settings.filenameCase
	);
}

/**
 * Generate a unique filename by adding -index suffix if file exists
 * @param app Obsidian app instance
 * @param folderPath Folder path (vault-relative)
 * @param baseName Base filename without extension (e.g., "My Note Title")
 * @param extension File extension (e.g., "md")
 * @returns Vault-relative path to unique filename
 */
export function generateUniqueFilename(
	app: App,
	folderPath: string,
	baseName: string,
	extension: string
): string {
	// Sanitize the base name to remove invalid characters
	const sanitizedBaseName = sanitizeFilename(baseName);

	let filename = `${sanitizedBaseName}.${extension}`;
	let fullPath = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
	let counter = 1;

	while (app.vault.getAbstractFileByPath(fullPath)) {
		filename = `${sanitizedBaseName}-${counter}.${extension}`;
		fullPath = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
		counter++;
	}

	return fullPath;
}

/**
 * Check if a note was created by our plugin
 */
export function isPluginCreatedNote(frontmatter: Partial<ItemFrontmatter> | undefined): boolean {
	const validEntityTypes = ['milestone', 'story', 'task', 'decision', 'document', 'feature'];
	return !!(
		frontmatter &&
		frontmatter.type &&
		frontmatter.id &&
		frontmatter.canvas_source &&
		validEntityTypes.includes(frontmatter.type)
	);
}

