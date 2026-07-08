/**
 * Integration: syncEdgesToMdFiles against the in-memory obsidian mock. Reads a canvas's
 * file-nodes + edges and writes computed depends_on into the *target* (toNode) md files.
 * Fully vault-I/O — no canvas render. Asserts the resulting depends_on frontmatter.
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

/** Build a canvas with file nodes n0.. mapped to the given file paths, plus edges. */
function canvas(files: string[], edges: Array<[number, number]>): string {
	return JSON.stringify({
		nodes: files.map((f, i) => ({ id: `n${i}`, type: "file", file: f, x: 0, y: 0, width: 100, height: 100 })),
		edges: edges.map(([from, to], i) => ({ id: `e${i}`, fromNode: `n${from}`, toNode: `n${to}` })),
	});
}

describe("syncEdgesToMdFiles (integration via obsidian mock)", () => {
	it("writes the source entity id into the target file's depends_on", async () => {
		// Edge A(n0) -> B(n1): B depends_on A's id.
		const { plugin, vault } = makePlugin({
			[CANVAS]: canvas(["A.md", "B.md"], [[0, 1]]),
			"A.md": note({ type: "task", id: "A-1", canvas_source: CANVAS }),
			"B.md": note({ type: "task", id: "B-1", canvas_source: CANVAS, depends_on: "[]" }),
		});

		await plugin.syncEdgesToMdFiles(new TFile(CANVAS));

		// Canonical EntitySerializer format: block-sequence array, plain item.
		expect(vault._files.get("B.md")!).toMatch(/depends_on:\n\s*-\s*A-1/);
		// source file gets no depends_on item written
		expect(vault._files.get("A.md")!).not.toMatch(/depends_on:\n\s*-/);
	});

	it("aggregates multiple incoming edges into one depends_on array on the target", async () => {
		// A(n0)->C(n2) and B(n1)->C(n2): C depends_on [A-1, B-1]
		const { plugin, vault } = makePlugin({
			[CANVAS]: canvas(["A.md", "B.md", "C.md"], [[0, 2], [1, 2]]),
			"A.md": note({ type: "task", id: "A-1", canvas_source: CANVAS }),
			"B.md": note({ type: "task", id: "B-1", canvas_source: CANVAS }),
			"C.md": note({ type: "task", id: "C-1", canvas_source: CANVAS, depends_on: "[]" }),
		});

		await plugin.syncEdgesToMdFiles(new TFile(CANVAS));

		const c = vault._files.get("C.md")!;
		expect(c).toMatch(/-\s*A-1/);
		expect(c).toMatch(/-\s*B-1/);
	});

	it("ignores edges to/from non-plugin (manual) notes", async () => {
		// manual A has no canvas_source → not a plugin file, so B gets no dependency.
		const { plugin, vault } = makePlugin({
			[CANVAS]: canvas(["A.md", "B.md"], [[0, 1]]),
			"A.md": note({ type: "task", id: "A-1" }), // no canvas_source
			"B.md": note({ type: "task", id: "B-1", canvas_source: CANVAS, depends_on: "[]" }),
		});
		const before = vault._files.get("B.md");

		await plugin.syncEdgesToMdFiles(new TFile(CANVAS));

		expect(vault._files.get("B.md")).toBe(before); // unchanged
	});

	it("is a no-op on a canvas with no edges", async () => {
		const { plugin, vault } = makePlugin({
			[CANVAS]: canvas(["A.md"], []),
			"A.md": note({ type: "task", id: "A-1", canvas_source: CANVAS, depends_on: "[]" }),
		});
		const before = vault._files.get("A.md");

		await plugin.syncEdgesToMdFiles(new TFile(CANVAS));

		expect(vault._files.get("A.md")).toBe(before);
	});
});
