import {
	mapNotionStatusToLocal,
	richTextToPlain,
	notionBlocksToMarkdown,
	buildMarkdownContent,
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

describe("buildMarkdownContent", () => {
	const base: ItemFrontmatter = {
		type: "task",
		title: "My Task",
		effort: "engineering",
		id: "T-001",
		status: "In Progress",
		priority: "High",
		created_at: "2026-01-01",
		updated_at: "2026-01-02",
		canvas_source: "board.canvas",
		vault_path: "tasks/T-001.md",
	} as ItemFrontmatter;

	it("assembles YAML frontmatter followed by the body", () => {
		const out = buildMarkdownContent(base, "Body text");
		expect(out).toBe(
			[
				"---",
				"type: task",
				'title: "My Task"',
				"effort: engineering",
				"id: T-001",
				'status: "In Progress"',
				"priority: High",
				"inProgress: false",
				"created_by_plugin: true",
				"created_at: 2026-01-01",
				"updated_at: 2026-01-02",
				'canvas_source: "board.canvas"',
				'vault_path: "tasks/T-001.md"',
				"---",
				"",
				"Body text",
			].join("\n"),
		);
	});

	it("escapes double quotes in the title", () => {
		const out = buildMarkdownContent({ ...base, title: 'A "quoted" title' }, "");
		expect(out).toContain('title: "A \\"quoted\\" title"');
	});

	it("includes optional time_estimate, depends_on and notion_page_id when present", () => {
		const out = buildMarkdownContent(
			{
				...base,
				time_estimate: 4,
				depends_on: ["T-000", "T-002"],
				notion_page_id: "abc123",
				inProgress: true,
			},
			"b",
		);
		expect(out).toContain("time_estimate: 4");
		expect(out).toContain('depends_on: ["T-000", "T-002"]');
		expect(out).toContain('notion_page_id: "abc123"');
		expect(out).toContain("inProgress: true");
	});

	it("omits optional fields when absent and honors created/updated legacy fallbacks", () => {
		const out = buildMarkdownContent(
			{
				...base,
				created_at: undefined as unknown as string,
				updated_at: undefined as unknown as string,
				created: "legacy-created",
				updated: "legacy-updated",
				created_by_plugin: false,
			},
			"b",
		);
		expect(out).not.toContain("time_estimate:");
		expect(out).not.toContain("depends_on:");
		expect(out).not.toContain("notion_page_id:");
		expect(out).toContain("created_at: legacy-created");
		expect(out).toContain("updated_at: legacy-updated");
		expect(out).toContain("created_by_plugin: false");
	});

	it("emits empty created_at/updated_at when neither new nor legacy fields exist", () => {
		const out = buildMarkdownContent(
			{
				...base,
				created_at: undefined as unknown as string,
				updated_at: undefined as unknown as string,
			},
			"b",
		);
		expect(out).toContain("created_at: \n");
		expect(out).toContain("updated_at: \n");
	});

	it("treats an empty depends_on array as absent", () => {
		const out = buildMarkdownContent({ ...base, depends_on: [] }, "b");
		expect(out).not.toContain("depends_on:");
	});
});
