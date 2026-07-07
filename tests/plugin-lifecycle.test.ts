/**
 * Integration: plugin-created-file detection, canvas-driven cleanup, and note-path
 * routing, all against the in-memory obsidian mock.
 *   - isPluginCreatedFile(): frontmatter-based ownership check.
 *   - checkAndDeletePluginFile(): trashes plugin notes dropped from their canvas.
 *   - determineNotePath(): inferBaseFolderFromCanvas vs notesBaseFolder fallback.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, TFile, Vault } from "./harness/obsidian-mock";

const MANIFEST = {
	id: "canvas-structured-items",
	name: "Canvas Structured Items",
	version: "0.0.0-test",
	minAppVersion: "1.0.0",
	author: "test",
	description: "test",
};

type Settings = {
	inferBaseFolderFromCanvas: boolean;
	notesBaseFolder: string;
};

function makePlugin(seed: Record<string, string> = {}) {
	const app = createTestApp(seed);
	const plugin = new CanvasStructuredItemsPlugin(app as never, MANIFEST as never);
	return {
		plugin: plugin as unknown as Record<string, (...a: unknown[]) => Promise<unknown>> & { settings: Settings },
		vault: app.vault as unknown as Vault,
	};
}

function note(fields: Record<string, string>): string {
	// parseFrontmatter/isPluginCreatedNote need type+title+id; default a title.
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

describe("isPluginCreatedFile (integration via obsidian mock)", () => {
	const CANVAS = "board.canvas";

	it("returns true for a note with type+id+canvas_source", async () => {
		const { plugin } = makePlugin({
			"tasks/T-001.md": note({ type: "task", id: "T-001", canvas_source: CANVAS }),
		});
		expect(await plugin.isPluginCreatedFile("tasks/T-001.md")).toBe(true);
	});

	it("returns false when canvas_source is missing", async () => {
		const { plugin } = makePlugin({
			"tasks/T-002.md": note({ type: "task", id: "T-002" }),
		});
		expect(await plugin.isPluginCreatedFile("tasks/T-002.md")).toBe(false);
	});

	it("returns false for a file with no frontmatter", async () => {
		const { plugin } = makePlugin({ "notes/plain.md": "just text" });
		expect(await plugin.isPluginCreatedFile("notes/plain.md")).toBe(false);
	});

	it("returns false for a non-existent path", async () => {
		const { plugin } = makePlugin();
		expect(await plugin.isPluginCreatedFile("nope.md")).toBe(false);
	});
});

describe("checkAndDeletePluginFile (integration via obsidian mock)", () => {
	const CANVAS = "board.canvas";

	it("deletes plugin notes that reference this canvas but are no longer on it", async () => {
		const { plugin, vault } = makePlugin({
			[CANVAS]: JSON.stringify({ nodes: [], edges: [] }),
			// references this canvas, NOT in the current node set -> should be trashed
			"tasks/gone.md": note({ type: "task", id: "T-1", canvas_source: CANVAS }),
			// references this canvas AND still present -> kept
			"tasks/stay.md": note({ type: "task", id: "T-2", canvas_source: CANVAS }),
			// references a different canvas -> kept
			"tasks/other.md": note({ type: "task", id: "T-3", canvas_source: "other.canvas" }),
			// not a plugin note -> kept
			"tasks/manual.md": note({ type: "task", id: "T-4" }),
		});

		const canvasFile = new TFile(CANVAS);
		const currentNodes = new Set<string>(["tasks/stay.md"]);
		await plugin.checkAndDeletePluginFile(canvasFile, currentNodes);

		expect(vault._files.has("tasks/gone.md")).toBe(false);
		expect(vault._files.has("tasks/stay.md")).toBe(true);
		expect(vault._files.has("tasks/other.md")).toBe(true);
		expect(vault._files.has("tasks/manual.md")).toBe(true);
	});
});

describe("determineNotePath folder routing (integration via obsidian mock)", () => {
	it("infers the base folder from the canvas file's parent when no type is given", async () => {
		const { plugin, vault } = makePlugin();
		plugin.settings.inferBaseFolderFromCanvas = true;

		const canvasFile = new TFile("MyProject/board.canvas");
		const path = (await plugin.determineNotePath(canvasFile, "Some Title", "T-100", undefined)) as string;

		expect(path.startsWith("MyProject/")).toBe(true);
		expect(path).toContain("T-100");
		expect(vault._folders.has("MyProject")).toBe(true);
	});

	it("falls back to notesBaseFolder when inference is disabled and no type is given", async () => {
		const { plugin, vault } = makePlugin();
		plugin.settings.inferBaseFolderFromCanvas = false;
		plugin.settings.notesBaseFolder = "Inbox";

		const canvasFile = new TFile("board.canvas");
		const path = (await plugin.determineNotePath(canvasFile, "Some Title", "T-101", undefined)) as string;

		expect(path.startsWith("Inbox/")).toBe(true);
		expect(path).toContain("T-101");
		expect(vault._folders.has("Inbox")).toBe(true);
	});
});
