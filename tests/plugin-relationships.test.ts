/**
 * Integration: relationship-writeback flows against the in-memory obsidian mock.
 *   - updateDependsOnInFile(): writes the depends_on field of a single plugin note.
 *   - syncReverseRelationships(): reads all file nodes on a canvas and writes the
 *     computed inverse fields (blocks, children, implemented_by) back into the files.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Vault } from "./harness/obsidian-mock";

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
	// parseFrontmatter/isPluginCreatedNote need type+title+id; default a title.
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

describe("updateDependsOnInFile (integration via obsidian mock)", () => {
	const CANVAS = "board.canvas";

	it("writes depends_on into a plugin note and reports it changed", async () => {
		const { plugin, vault } = makePlugin({
			"tasks/T-001.md": note({ type: "task", id: "T-001", canvas_source: CANVAS, depends_on: "[]" }),
		});

		const changed = await plugin.updateDependsOnInFile("tasks/T-001.md", ["T-000"]);

		expect(changed).toBe(true);
		const content = vault._files.get("tasks/T-001.md")!;
		// Canonical EntitySerializer format: block-sequence array, quoted item.
		expect(content).toMatch(/depends_on:\n\s*-\s*"T-000"/);
		// timestamp bookkeeping was applied
		expect(content).toMatch(/updated_at:/);
	});

	it("is a no-op (returns false) when depends_on already matches", async () => {
		const { plugin } = makePlugin({
			"tasks/T-002.md": note({ type: "task", id: "T-002", canvas_source: CANVAS, depends_on: '["T-000"]' }),
		});

		const changed = await plugin.updateDependsOnInFile("tasks/T-002.md", ["T-000"]);
		expect(changed).toBe(false);
	});

	it("returns false for a non-plugin note (no canvas_source)", async () => {
		const { plugin } = makePlugin({
			"tasks/T-003.md": note({ type: "task", id: "T-003" }),
		});
		expect(await plugin.updateDependsOnInFile("tasks/T-003.md", ["T-000"])).toBe(false);
	});

	it("returns false for a missing file", async () => {
		const { plugin } = makePlugin();
		expect(await plugin.updateDependsOnInFile("tasks/nope.md", ["T-000"])).toBe(false);
	});
});

describe("syncReverseRelationships (integration via obsidian mock)", () => {
	const CANVAS = "board.canvas";

	function canvasWith(files: string[]): string {
		return JSON.stringify({
			nodes: files.map((f, i) => ({ id: `n${i}`, type: "file", file: f, x: 0, y: 0, width: 100, height: 100 })),
			edges: [],
		});
	}

	it("writes blocks (reverse of depends_on) and children (reverse of parent)", async () => {
		const seed: Record<string, string> = {
			[CANVAS]: canvasWith(["A.md", "B.md", "C.md"]),
			// A depends_on B  => B.blocks should include A-1
			"A.md": note({ type: "task", id: "A-1", canvas_source: CANVAS, depends_on: "[B-1]" }),
			// C parent B      => B.children should include C-1
			"B.md": note({ type: "story", id: "B-1", canvas_source: CANVAS }),
			"C.md": note({ type: "task", id: "C-1", canvas_source: CANVAS, parent: "B-1" }),
		};
		const { plugin, vault } = makePlugin(seed);

		await plugin.syncReverseRelationships({ path: CANVAS, name: "board.canvas" });

		const b = vault._files.get("B.md")!;
		expect(b).toMatch(/blocks:\n\s*-\s*"A-1"/);
		expect(b).toMatch(/children:\n\s*-\s*"C-1"/);
	});

	it("writes implemented_by (reverse of implements) onto the feature file", async () => {
		const seed: Record<string, string> = {
			[CANVAS]: canvasWith(["S.md", "F.md"]),
			"S.md": note({ type: "story", id: "S-1", canvas_source: CANVAS, implements: "[F-1]" }),
			"F.md": note({ type: "feature", id: "F-1", canvas_source: CANVAS }),
		};
		const { plugin, vault } = makePlugin(seed);

		await plugin.syncReverseRelationships({ path: CANVAS, name: "board.canvas" });

		expect(vault._files.get("F.md")!).toMatch(/implemented_by:\n\s*-\s*"S-1"/);
	});

	it("does not rewrite files whose reverse fields are already correct", async () => {
		const seed: Record<string, string> = {
			[CANVAS]: canvasWith(["A.md", "B.md"]),
			"A.md": note({ type: "task", id: "A-1", canvas_source: CANVAS, depends_on: "[B-1]" }),
			// B already carries the correct inverse
			"B.md": note({ type: "story", id: "B-1", canvas_source: CANVAS, blocks: '["A-1"]' }),
		};
		const { plugin, vault } = makePlugin(seed);
		const before = vault._files.get("B.md")!;

		await plugin.syncReverseRelationships({ path: CANVAS, name: "board.canvas" });

		// unchanged (no updated_at churn) because the inverse already matched
		expect(vault._files.get("B.md")).toBe(before);
	});
});
