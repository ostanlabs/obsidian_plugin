import {
	mapNotionStatusToLocal,
	richTextToPlain,
	notionBlocksToMarkdown,
} from "../util/notionMarkdown";
import { ItemFrontmatter, NotionBlock, NotionRichText } from "../types";

const rt = (text: string): NotionRichText => ({ type: "text", plain_text: text });

describe("mapNotionStatusToLocal", () => {
	it("maps each known Notion status to its local status", () => {
		expect(mapNotionStatusToLocal("todo")).toBe("Not Started");
		expect(mapNotionStatusToLocal("in_progress")).toBe("In Progress");
		expect(mapNotionStatusToLocal("done")).toBe("Completed");
		expect(mapNotionStatusToLocal("blocked")).toBe("Blocked");
	});

	it("falls back to 'Not Started' for an unknown status", () => {
		expect(mapNotionStatusToLocal("archived")).toBe("Not Started");
		expect(mapNotionStatusToLocal("")).toBe("Not Started");
	});
});

describe("richTextToPlain", () => {
	it("concatenates plain_text across multiple segments", () => {
		expect(richTextToPlain([rt("Hello "), rt("world"), rt("!")])).toBe("Hello world!");
	});

	it("returns an empty string for an empty array", () => {
		expect(richTextToPlain([])).toBe("");
	});

	it("treats missing plain_text as an empty segment", () => {
		expect(richTextToPlain([{ type: "text" }, rt("x")])).toBe("x");
	});

	it("returns empty string for null/undefined or non-array input", () => {
		// @ts-expect-error deliberately passing null to cover the guard
		expect(richTextToPlain(null)).toBe("");
		// @ts-expect-error deliberately passing undefined to cover the guard
		expect(richTextToPlain(undefined)).toBe("");
		// @ts-expect-error deliberately passing a non-array to cover the guard
		expect(richTextToPlain("nope")).toBe("");
	});
});

describe("notionBlocksToMarkdown", () => {
	it("renders headings 1-3", () => {
		const blocks: NotionBlock[] = [
			{ type: "heading_1", heading_1: { rich_text: [rt("H1")] } },
			{ type: "heading_2", heading_2: { rich_text: [rt("H2")] } },
			{ type: "heading_3", heading_3: { rich_text: [rt("H3")] } },
		];
		expect(notionBlocksToMarkdown(blocks)).toBe("# H1\n## H2\n### H3");
	});

	it("renders paragraphs, bulleted and numbered list items", () => {
		const blocks: NotionBlock[] = [
			{ type: "paragraph", paragraph: { rich_text: [rt("a para")] } },
			{ type: "bulleted_list_item", bulleted_list_item: { rich_text: [rt("bullet")] } },
			{ type: "numbered_list_item", numbered_list_item: { rich_text: [rt("num")] } },
		];
		expect(notionBlocksToMarkdown(blocks)).toBe("a para\n- bullet\n1. num");
	});

	it("renders to_do blocks checked and unchecked", () => {
		const blocks: NotionBlock[] = [
			{ type: "to_do", to_do: { rich_text: [rt("done")], checked: true } },
			{ type: "to_do", to_do: { rich_text: [rt("todo")], checked: false } },
			{ type: "to_do", to_do: { rich_text: [rt("nochk")] } },
		];
		expect(notionBlocksToMarkdown(blocks)).toBe("- [x] done\n- [ ] todo\n- [ ] nochk");
	});

	it("renders a divider", () => {
		expect(notionBlocksToMarkdown([{ type: "divider" }])).toBe("---");
	});

	it("uses empty rich_text when a block payload is missing", () => {
		const blocks: NotionBlock[] = [
			{ type: "heading_1" },
			{ type: "paragraph" },
			{ type: "bulleted_list_item" },
			{ type: "numbered_list_item" },
			{ type: "to_do" },
			{ type: "heading_2" },
			{ type: "heading_3" },
		];
		expect(notionBlocksToMarkdown(blocks)).toBe("# \n\n- \n1. \n- [ ] \n## \n### ");
	});

	it("skips unsupported block types", () => {
		const blocks: NotionBlock[] = [
			{ type: "paragraph", paragraph: { rich_text: [rt("keep")] } },
			{ type: "code", code: { rich_text: [rt("ignored")] } },
			{ type: "quote", quote: { rich_text: [rt("ignored")] } },
			{ type: "unknown_block_type" },
		];
		expect(notionBlocksToMarkdown(blocks)).toBe("keep");
	});

	it("returns empty string for no blocks", () => {
		expect(notionBlocksToMarkdown([])).toBe("");
	});
});

