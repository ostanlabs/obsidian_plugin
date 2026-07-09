/**
 * Pure Notion <-> markdown/status conversion helpers.
 *
 * Extracted from main.ts (Phase 5) so they can be unit-tested in isolation.
 * This module MUST remain obsidian-free (no `obsidian` import, no `this.app`,
 * `vault`, `Notice`, `settings`, or `await`). All functions are pure.
 */
import { ItemStatus, ItemFrontmatter, NotionBlock, NotionRichText } from "../types";

/**
 * Map Notion status to local status.
 */
export function mapNotionStatusToLocal(notionStatus: string): ItemStatus {
	const map: Record<string, ItemStatus> = {
		"todo": "Not Started",
		"in_progress": "In Progress",
		"done": "Completed",
		"blocked": "Blocked",
	};
	return map[notionStatus] || "Not Started";
}

/**
 * Convert Notion rich text to plain text.
 */
export function richTextToPlain(richText: NotionRichText[]): string {
	if (!richText || !Array.isArray(richText)) return "";
	return richText.map(rt => rt.plain_text || "").join("");
}

/**
 * Convert Notion blocks to markdown.
 */
export function notionBlocksToMarkdown(blocks: NotionBlock[]): string {
	const lines: string[] = [];

	for (const block of blocks) {
		switch (block.type) {
			case "heading_1":
				lines.push(`# ${richTextToPlain(block.heading_1?.rich_text || [])}`);
				break;
			case "heading_2":
				lines.push(`## ${richTextToPlain(block.heading_2?.rich_text || [])}`);
				break;
			case "heading_3":
				lines.push(`### ${richTextToPlain(block.heading_3?.rich_text || [])}`);
				break;
			case "paragraph":
				lines.push(richTextToPlain(block.paragraph?.rich_text || []));
				break;
			case "bulleted_list_item":
				lines.push(`- ${richTextToPlain(block.bulleted_list_item?.rich_text || [])}`);
				break;
			case "numbered_list_item":
				lines.push(`1. ${richTextToPlain(block.numbered_list_item?.rich_text || [])}`);
				break;
			case "to_do": {
				const checked = block.to_do?.checked ? "x" : " ";
				lines.push(`- [${checked}] ${richTextToPlain(block.to_do?.rich_text || [])}`);
				break;
			}
			case "divider":
				lines.push("---");
				break;
			default:
				// Skip unsupported block types
				break;
		}
	}

	return lines.join("\n");
}

