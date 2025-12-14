import { App } from "obsidian";
import { CanvasItemFromTemplateSettings } from "../types";

/**
 * Generate a unique ID for a new accomplishment
 * Scans existing notes to find the highest ID and increments
 */
export function generateId(
	app: App,
	settings: CanvasItemFromTemplateSettings
): string {
	const prefix = settings.idPrefixAccomplishment;
	const padLength = settings.idZeroPadLength;

	// Get all markdown files
	const files = app.vault.getMarkdownFiles();

	// Find the highest ID for this prefix
	let maxId = 0;

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) continue;

		const fileId = cache.frontmatter.id;
		if (typeof fileId === "string" && fileId.startsWith(prefix)) {
			// Extract the numeric part
			const numericPart = fileId.slice(prefix.length);
			const num = parseInt(numericPart, 10);
			if (!isNaN(num) && num > maxId) {
				maxId = num;
			}
		}
	}

	// Generate new ID
	const newId = maxId + 1;
	const paddedId = String(newId).padStart(padLength, "0");

	return `${prefix}${paddedId}`;
}

/**
 * Find the highest ID currently in use (for display/debugging)
 */
export function findHighestId(
	app: App,
	prefix: string
): number {
	const files = app.vault.getMarkdownFiles();
	let maxId = 0;

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) continue;

		const fileId = cache.frontmatter.id;
		if (typeof fileId === "string" && fileId.startsWith(prefix)) {
			const numericPart = fileId.slice(prefix.length);
			const num = parseInt(numericPart, 10);
			if (!isNaN(num) && num > maxId) {
				maxId = num;
			}
		}
	}

	return maxId;
}

