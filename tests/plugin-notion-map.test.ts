/**
 * Integration: updateLocalFileFromNotion against the in-memory obsidian mock, with a
 * stubbed notionClient supplying page blocks. Exercises the Notion→local mapping path:
 * mapNotionStatusToLocal, notionBlocksToMarkdown, richTextToPlain,
 * plus the property→frontmatter projection and the vault.modify writeback. Also covers
 * the delegating pure wrappers directly.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, TFile, Vault } from "./harness/obsidian-mock";
import { parseRawFrontmatter } from "../util/frontmatter";

const MANIFEST = {
	id: "canvas-structured-items",
	name: "Canvas Structured Items",
	version: "0.0.0-test",
	minAppVersion: "1.0.0",
	author: "test",
	description: "test",
};

function makePlugin(seed: Record<string, string> = {}) {
	const app = createTestApp(seed);
	const plugin = new CanvasStructuredItemsPlugin(app as never, MANIFEST as never);
	return {
		plugin: plugin as unknown as Record<string, (...a: unknown[]) => Promise<unknown>> & {
			notionClient: unknown;
		},
		vault: app.vault as unknown as Vault,
	};
}

function note(fields: Record<string, string>): string {
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

/** A page with a paragraph block and select properties, as returned by the Notion API. */
function pageWithBlocks(props: Record<string, unknown>, blocks: unknown[]) {
	return {
		page: { id: "pg-1", properties: props, last_edited_time: "2024-05-01T10:00:00.000Z" },
		blocks,
	};
}

describe("updateLocalFileFromNotion (integration via obsidian mock)", () => {
	it("projects Notion properties + blocks into the local file's frontmatter and body", async () => {
		const { plugin, vault } = makePlugin({
			"tasks/T-001.md": note({ type: "task", id: "T-001", canvas_source: "" }),
		});
		const blocks = [
			{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "Hello from Notion" }] } },
		];
		const props = {
			Title: { title: [{ plain_text: "Renamed Task" }] },
			Status: { select: { name: "done" } },
			Priority: { select: { name: "High" } },
			"In Progress": { checkbox: true },
		};
		const { page } = pageWithBlocks(props, blocks);
		plugin.notionClient = { getPageContent: async () => blocks };

		await plugin.updateLocalFileFromNotion(new TFile("tasks/T-001.md"), page);

		const content = vault._files.get("tasks/T-001.md")!;
		const fm = parseRawFrontmatter(content)!;
		expect(fm.title).toBe("Renamed Task");
		expect(fm.status).toBe("Completed"); // "Done" → Completed via mapNotionStatusToLocal
		expect(fm.priority).toBe("High");
		expect(fm.inProgress).toBe(true);
		// body sourced from the Notion blocks
		expect(content).toContain("Hello from Notion");
	});

	it("returns without writing when the local file has no frontmatter", async () => {
		const { plugin, vault } = makePlugin({ "notes/plain.md": "no frontmatter" });
		plugin.notionClient = { getPageContent: async () => [] };
		const before = vault._files.get("notes/plain.md");

		await plugin.updateLocalFileFromNotion(new TFile("notes/plain.md"), {
			id: "pg",
			properties: { Title: { title: [{ plain_text: "X" }] } },
		} as never);

		expect(vault._files.get("notes/plain.md")).toBe(before);
	});
});

describe("Notion mapping wrappers (delegating pure helpers)", () => {
	it("mapNotionStatusToLocal maps known Notion statuses", () => {
		const { plugin } = makePlugin();
		const map = plugin as unknown as { mapNotionStatusToLocal: (s: string) => string };
		expect(map.mapNotionStatusToLocal("done")).toBe("Completed");
		expect(map.mapNotionStatusToLocal("in_progress")).toBe("In Progress");
		expect(map.mapNotionStatusToLocal("unknown")).toBe("Not Started");
	});

	it("notionBlocksToMarkdown + richTextToPlain render block text", () => {
		const { plugin } = makePlugin();
		const p = plugin as unknown as {
			notionBlocksToMarkdown: (b: unknown[]) => string;
			richTextToPlain: (r: unknown[]) => string;
		};
		const md = p.notionBlocksToMarkdown([
			{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "line one" }] } },
		]);
		expect(md).toContain("line one");
		expect(p.richTextToPlain([{ plain_text: "a" }, { plain_text: "b" }])).toBe("ab");
	});
});
