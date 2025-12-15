/**
 * Content sync utilities for converting between Markdown and Notion blocks
 */

/**
 * Notion block types we support
 */
export type NotionBlockType =
	| "heading_1"
	| "heading_2"
	| "heading_3"
	| "paragraph"
	| "bulleted_list_item"
	| "numbered_list_item"
	| "to_do"
	| "divider";

/**
 * Notion rich text segment
 */
interface NotionRichTextSegment {
	type: "text";
	text: { content: string };
	plain_text?: string;
	annotations?: {
		bold?: boolean;
		italic?: boolean;
		strikethrough?: boolean;
		underline?: boolean;
		code?: boolean;
	};
}

/**
 * Notion block structure
 */
interface NotionBlock {
	object: "block";
	type: NotionBlockType;
	heading_1?: { rich_text: NotionRichTextSegment[] };
	heading_2?: { rich_text: NotionRichTextSegment[] };
	heading_3?: { rich_text: NotionRichTextSegment[] };
	paragraph?: { rich_text: NotionRichTextSegment[] };
	bulleted_list_item?: { rich_text: NotionRichTextSegment[] };
	numbered_list_item?: { rich_text: NotionRichTextSegment[] };
	to_do?: { rich_text: NotionRichTextSegment[]; checked: boolean };
	divider?: Record<string, never>;
}

/**
 * Parse markdown body (without frontmatter) into Notion blocks
 */
export function markdownToNotionBlocks(markdown: string): NotionBlock[] {
	const blocks: NotionBlock[] = [];
	const lines = markdown.split("\n");
	
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		
		// Skip empty lines
		if (line.trim() === "") {
			i++;
			continue;
		}
		
		// Heading 1: # Title
		if (line.startsWith("# ")) {
			blocks.push(createHeading1Block(line.substring(2).trim()));
			i++;
			continue;
		}
		
		// Heading 2: ## Title
		if (line.startsWith("## ")) {
			blocks.push(createHeading2Block(line.substring(3).trim()));
			i++;
			continue;
		}
		
		// Heading 3: ### Title
		if (line.startsWith("### ")) {
			blocks.push(createHeading3Block(line.substring(4).trim()));
			i++;
			continue;
		}
		
		// Checkbox: - [ ] or - [x]
		const checkboxMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
		if (checkboxMatch) {
			const checked = checkboxMatch[1].toLowerCase() === "x";
			const text = checkboxMatch[2];
			blocks.push(createToDoBlock(text, checked));
			i++;
			continue;
		}
		
		// Bulleted list: - item or * item
		if (line.match(/^[-*]\s+/)) {
			const text = line.replace(/^[-*]\s+/, "");
			blocks.push(createBulletedListBlock(text));
			i++;
			continue;
		}
		
		// Numbered list: 1. item
		const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
		if (numberedMatch) {
			blocks.push(createNumberedListBlock(numberedMatch[1]));
			i++;
			continue;
		}
		
		// Horizontal rule: --- or ***
		if (line.match(/^[-*]{3,}$/)) {
			blocks.push(createDividerBlock());
			i++;
			continue;
		}
		
		// Default: paragraph
		// Collect consecutive non-empty lines that aren't special
		let paragraphText = line;
		i++;
		while (i < lines.length) {
			const nextLine = lines[i];
			if (
				nextLine.trim() === "" ||
				nextLine.startsWith("#") ||
				nextLine.match(/^[-*]\s/) ||
				nextLine.match(/^\d+\.\s/) ||
				nextLine.match(/^[-*]{3,}$/)
			) {
				break;
			}
			paragraphText += "\n" + nextLine;
			i++;
		}
		
		blocks.push(createParagraphBlock(paragraphText));
	}
	
	return blocks;
}

/**
 * Convert Notion blocks back to markdown
 */
export function notionBlocksToMarkdown(blocks: NotionBlock[]): string {
	const lines: string[] = [];

	for (const block of blocks) {
		const type = block.type;

		switch (type) {
			case "heading_1":
				lines.push(`# ${extractRichText(block.heading_1?.rich_text)}`);
				break;
			case "heading_2":
				lines.push(`## ${extractRichText(block.heading_2?.rich_text)}`);
				break;
			case "heading_3":
				lines.push(`### ${extractRichText(block.heading_3?.rich_text)}`);
				break;
			case "paragraph": {
				const text = extractRichText(block.paragraph?.rich_text);
				if (text) {
					lines.push(text);
				}
				lines.push(""); // Add blank line after paragraph
				break;
			}
			case "bulleted_list_item":
				lines.push(`- ${extractRichText(block.bulleted_list_item?.rich_text)}`);
				break;
			case "numbered_list_item":
				lines.push(`1. ${extractRichText(block.numbered_list_item?.rich_text)}`);
				break;
			case "to_do": {
				const checked = block.to_do?.checked ? "x" : " ";
				lines.push(`- [${checked}] ${extractRichText(block.to_do?.rich_text)}`);
				break;
			}
			case "divider":
				lines.push("---");
				break;
			default: {
				// Unknown block type, try to extract any text
				const unknownType: string = type;
				console.debug(`[Content Sync] Unknown block type: ${unknownType}`);
			}
		}
	}
	
	return lines.join("\n");
}

/**
 * Extract plain text from Notion rich_text array
 */
function extractRichText(richText: NotionRichTextSegment[] | undefined): string {
	if (!richText || !Array.isArray(richText)) {
		return "";
	}
	return richText.map(rt => rt.plain_text || rt.text?.content || "").join("");
}

/**
 * Create rich_text array for Notion
 */
function createRichText(text: string): NotionRichTextSegment[] {
	// Parse bold (**text**) and italic (*text* or _text_)
	const segments: NotionRichTextSegment[] = [];
	const remaining = text;

	// Simple approach: just create plain text for now
	// TODO: Add support for bold, italic, code, links
	if (remaining) {
		segments.push({
			type: "text",
			text: { content: remaining },
		});
	}

	return segments;
}

function createHeading1Block(text: string): NotionBlock {
	return {
		object: "block",
		type: "heading_1",
		heading_1: {
			rich_text: createRichText(text),
		},
	};
}

function createHeading2Block(text: string): NotionBlock {
	return {
		object: "block",
		type: "heading_2",
		heading_2: {
			rich_text: createRichText(text),
		},
	};
}

function createHeading3Block(text: string): NotionBlock {
	return {
		object: "block",
		type: "heading_3",
		heading_3: {
			rich_text: createRichText(text),
		},
	};
}

function createParagraphBlock(text: string): NotionBlock {
	return {
		object: "block",
		type: "paragraph",
		paragraph: {
			rich_text: createRichText(text),
		},
	};
}

function createBulletedListBlock(text: string): NotionBlock {
	return {
		object: "block",
		type: "bulleted_list_item",
		bulleted_list_item: {
			rich_text: createRichText(text),
		},
	};
}

function createNumberedListBlock(text: string): NotionBlock {
	return {
		object: "block",
		type: "numbered_list_item",
		numbered_list_item: {
			rich_text: createRichText(text),
		},
	};
}

function createToDoBlock(text: string, checked: boolean): NotionBlock {
	return {
		object: "block",
		type: "to_do",
		to_do: {
			rich_text: createRichText(text),
			checked,
		},
	};
}

function createDividerBlock(): NotionBlock {
	return {
		object: "block",
		type: "divider",
		divider: {},
	};
}

/**
 * Extract body content from markdown (everything after frontmatter)
 */
export function extractBodyFromMarkdown(content: string): string {
	// Find the end of frontmatter (second ---)
	const frontmatterEnd = content.indexOf("---", 3);
	if (frontmatterEnd === -1) {
		return content;
	}
	
	// Return everything after frontmatter, trimmed
	return content.substring(frontmatterEnd + 3).trim();
}

/**
 * Combine frontmatter and body back into full markdown
 */
export function combineMarkdown(frontmatter: string, body: string): string {
	return `${frontmatter}\n\n${body}`;
}

