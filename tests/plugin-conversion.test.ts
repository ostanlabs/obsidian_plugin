/**
 * Integration: the note-conversion create pipeline (performNoteConversion) against the
 * in-memory obsidian mock. Exercises generateEntityId → normalizeStatus/Priority →
 * frontmatter merge → createWithFrontmatter → vault.modify, asserting the rewritten
 * file's frontmatter. (performCanvasNodeConversion is intentionally NOT tested — it
 * routes through saveCanvasData + reloadCanvasViewsWithViewport, i.e. canvas render.)
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, TFile, Vault } from "./harness/obsidian-mock";
import { parseRawFrontmatter } from "../util/frontmatter";
import { _resetSessionHighWaterForTests } from "../util/idGenerator";

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
		plugin: plugin as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>,
		vault: app.vault as unknown as Vault,
	};
}

describe("performNoteConversion (integration via obsidian mock)", () => {
	beforeEach(() => _resetSessionHighWaterForTests());

	it("rewrites a plain note into a structured task with generated id + normalized fields", async () => {
		const { plugin, vault } = makePlugin({
			"notes/Some Idea.md": "This is my raw note body.\n",
		});
		const file = new TFile("notes/Some Idea.md");

		await plugin.performNoteConversion(
			file,
			{ type: "task", effort: "core", alias: "idea" },
			{},
			"This is my raw note body.\n"
		);

		const content = vault._files.get("notes/Some Idea.md")!;
		const fm = parseRawFrontmatter(content)!;
		expect(fm.type).toBe("task");
		expect(fm.id).toBe("T-001");
		expect(fm.title).toBe("Some Idea"); // basename
		expect(fm.workstream).toBe("core"); // effort → workstream
		expect(fm.status).toBe("Not Started"); // normalized default
		expect(fm.priority).toBe("Medium"); // normalized default
		expect(fm.created_by_plugin).toBe(true);
		expect(fm.created_at).toBeTruthy();
		expect(fm.updated_at).toBeTruthy();
		// body preserved
		expect(content).toContain("This is my raw note body.");
	});

	it("preserves existing frontmatter fields (created_at, depends_on) while overwriting type/status", async () => {
		const existing = {
			created_at: "2020-01-01T00:00:00.000Z",
			depends_on: ["T-999"],
			status: "In Progress",
			priority: "High",
		};
		const { plugin, vault } = makePlugin({
			"notes/Legacy.md": "body\n",
		});
		const file = new TFile("notes/Legacy.md");

		await plugin.performNoteConversion(
			file,
			{ type: "story", effort: "growth", alias: undefined },
			existing,
			"body\n"
		);

		const fm = parseRawFrontmatter(vault._files.get("notes/Legacy.md")!)!;
		expect(fm.type).toBe("story");
		expect(fm.created_at).toBe("2020-01-01T00:00:00.000Z"); // kept
		expect(fm.depends_on).toEqual(["T-999"]); // kept
		// existing In Progress status is normalized and retained (not reset to Not Started)
		expect(fm.status).toBe("In Progress");
		expect(fm.priority).toBe("High");
	});

	it("normalizes a legacy/abbreviated status value on conversion", async () => {
		const { plugin, vault } = makePlugin({ "notes/x.md": "b\n" });
		const file = new TFile("notes/x.md");

		await plugin.performNoteConversion(
			file,
			{ type: "task", effort: "core" },
			{ status: "in_progress" },
			"b\n"
		);

		const fm = parseRawFrontmatter(vault._files.get("notes/x.md")!)!;
		// util/normalize maps assorted spellings to the canonical human-readable set
		expect(fm.status).toBe("In Progress");
	});

	it("does not sync to Notion when notion is disabled (default settings)", async () => {
		const { plugin, vault } = makePlugin({ "notes/y.md": "b\n" });
		const file = new TFile("notes/y.md");
		// If it tried to sync it would throw (no notionClient); success means it was skipped.
		await expect(
			plugin.performNoteConversion(file, { type: "task", effort: "core" }, {}, "b\n")
		).resolves.toBeUndefined();
		expect(vault._files.has("notes/y.md")).toBe(true);
	});
});
