import { App, TFile, normalizePath } from "obsidian";

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
 * Generate a unique filename by adding numbers if file exists
 * @param app Obsidian app instance
 * @param folderPath Folder path (vault-relative)
 * @param baseName Base filename without extension (e.g., "my_note")
 * @param extension File extension (e.g., "md")
 * @returns Vault-relative path to unique filename
 */
export async function generateUniqueFilename(
	app: App,
	folderPath: string,
	baseName: string,
	extension: string
): Promise<string> {
	let filename = `${baseName}.${extension}`;
	let fullPath = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
	let counter = 1;

	while (app.vault.getAbstractFileByPath(fullPath)) {
		filename = `${baseName}_${counter}.${extension}`;
		fullPath = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
		counter++;
	}

	return fullPath;
}

/**
 * Check if a note was created by our plugin
 */
export function isPluginCreatedNote(frontmatter: any): boolean {
	return !!(
		frontmatter &&
		frontmatter.type &&
		frontmatter.id &&
		frontmatter.canvas_source &&
		(frontmatter.type === "task" || frontmatter.type === "accomplishment")
	);
}

