/**
 * Integration: performCanvasNodeConversion — the canvas item create/convert pipeline —
 * against the in-memory obsidian mock. The canvas render helpers it routes through
 * (closeCanvasViews / reloadCanvasViewsWithViewport) are no-ops under the mock (no open
 * canvas leaves), so the whole flow is vault-I/O observable: templated note creation,
 * the parseFrontmatter id-reuse read for pre-existing note files, and the canvas JSON
 * node create/convert writeback.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Notice, TFile, Vault } from "./harness/obsidian-mock";
import { parseFrontmatter } from "../util/frontmatter";
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

function note(fields: Record<string, string>): string {
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

const CANVAS = "board.canvas";
const EMPTY_CANVAS = JSON.stringify({ nodes: [], edges: [] });

type CanvasJson = {
	nodes: Array<{ id: string; type: string; file?: string; text?: string; x: number; y: number; color?: string; metadata?: Record<string, unknown> }>;
	edges: unknown[];
};

// The conversion flow schedules trailing setTimeout work (menu-button refresh at 250ms
// touches `document`; the isUpdatingCanvas reset at 500ms). Provide a minimal document
// stub and flush those timers inside each test so nothing fires after teardown.
(globalThis as { document?: unknown }).document =
	(globalThis as { document?: unknown }).document ?? { querySelectorAll: () => [] };

const flushConversionTimers = () => new Promise((resolve) => setTimeout(resolve, 600));

describe("performCanvasNodeConversion (integration via obsidian mock)", () => {
	beforeEach(() => {
		_resetSessionHighWaterForTests();
		Notice.instances = [];
	});

	afterEach(flushConversionTimers);

	it("creates a templated note + new canvas node at the given position", async () => {
		const { plugin, vault } = makePlugin({ [CANVAS]: EMPTY_CANVAS });

		await plugin.performCanvasNodeConversion(
			null,
			new TFile(CANVAS),
			{ type: "task", effort: "core" },
			"My New Task",
			{ x: 100, y: 200 }
		);

		// note created under the tasks type folder with generated id + defaults
		const notePath = [...vault._files.keys()].find((p) => p.startsWith("tasks/") && p.endsWith(".md"))!;
		expect(notePath).toBeTruthy();
		const fm = parseFrontmatter(vault._files.get(notePath)!)!;
		expect(fm.id).toBe("T-001");
		expect(fm.type).toBe("task");
		expect(fm.title).toBe("My New Task");
		expect(fm.workstream).toBe("core");
		expect(fm.status).toBe("Not Started");
		expect(fm.created_by_plugin).toBe(true);
		expect(fm.canvas_source).toBe(CANVAS);

		// canvas gained a file node at the requested position
		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		expect(canvas.nodes).toHaveLength(1);
		expect(canvas.nodes[0].type).toBe("file");
		expect(canvas.nodes[0].file).toBe(notePath);
		expect(canvas.nodes[0].x).toBe(100);
		expect(canvas.nodes[0].y).toBe(200);
		expect(canvas.nodes[0].metadata).toMatchObject({ plugin: "canvas-project-manager", alias: "My New Task" });

		expect(Notice.instances.join("\n")).toContain("Created task: T-001");
	});

	it("reuses the id parsed from an existing note file instead of generating a new one", async () => {
		const { plugin, vault } = makePlugin({
			[CANVAS]: EMPTY_CANVAS,
			"tasks/Existing.md": note({ type: "task", id: "T-042", canvas_source: CANVAS }),
		});

		await plugin.performCanvasNodeConversion(
			null,
			new TFile(CANVAS),
			{ type: "task", effort: "core" },
			"Existing",
			{ x: 0, y: 0 },
			undefined,
			"tasks/Existing.md"
		);

		// no second note file; the parseFrontmatter read supplied the id
		const mdFiles = [...vault._files.keys()].filter((p) => p.endsWith(".md"));
		expect(mdFiles).toEqual(["tasks/Existing.md"]);
		expect(Notice.instances.join("\n")).toContain("Created task: T-042");

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		expect(canvas.nodes).toHaveLength(1);
		expect(canvas.nodes[0].file).toBe("tasks/Existing.md");
	});

	it("falls back to a generated id when the existing note has no parseable frontmatter", async () => {
		const { plugin } = makePlugin({
			[CANVAS]: EMPTY_CANVAS,
			"tasks/Bare.md": "no frontmatter here",
		});

		await plugin.performCanvasNodeConversion(
			null,
			new TFile(CANVAS),
			{ type: "task", effort: "core" },
			"Bare",
			{ x: 0, y: 0 },
			undefined,
			"tasks/Bare.md"
		);

		expect(Notice.instances.join("\n")).toContain("Created task: T-001");
	});

	it("converts an existing text node in-place (same node id, text dropped, file attached)", async () => {
		const canvasWithText = JSON.stringify({
			nodes: [{ id: "n1", type: "text", text: "Convert me", x: 10, y: 20, width: 100, height: 60 }],
			edges: [],
		});
		const { plugin, vault } = makePlugin({ [CANVAS]: canvasWithText });

		await plugin.performCanvasNodeConversion(
			null,
			new TFile(CANVAS),
			{ type: "story", effort: "core" },
			"Convert me",
			undefined,
			"n1"
		);

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		expect(canvas.nodes).toHaveLength(1);
		const node = canvas.nodes[0];
		expect(node.id).toBe("n1"); // same node id (in-place)
		expect(node.type).toBe("file");
		expect(node.text).toBeUndefined();
		expect(node.file).toMatch(/^stories\/.*\.md$/);
		// the backing story note was created with a generated id
		const fm = parseFrontmatter(vault._files.get(node.file!)!)!;
		expect(fm.id).toBe("S-001");
		expect(fm.type).toBe("story");
		expect(Notice.instances.join("\n")).toContain("Converted to story: S-001");
	});
});
