/**
 * Integration: handleMdFileModification + findFileByEntityId against the in-memory
 * obsidian mock. Only the non-canvas-render branches are exercised (a color change
 * routes through saveCanvasData + reloadCanvasViewsWithViewport, so we assert the
 * NO-CHANGE path where the node color already matches). Covers: skip while updating,
 * skip non-plugin notes, cache entity id + early-return when no canvas_source, and
 * the found-node color-already-correct path.
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
		plugin: plugin as unknown as Record<string, (...a: unknown[]) => Promise<unknown>> & {
			fileEntityIdCache: Map<string, string>;
			isUpdatingCanvas: boolean;
			findFileByEntityId: (id: string) => string | null;
		},
		vault: app.vault as unknown as Vault,
	};
}

function note(fields: Record<string, string>): string {
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

describe("handleMdFileModification (integration via obsidian mock)", () => {
	it("caches the entity id for a plugin note that has no canvas_source (early return)", async () => {
		const { plugin } = makePlugin({
			// isPluginCreatedNote requires canvas_source; give one so it's a plugin note,
			// but point it at a non-existent canvas so the flow returns before any save.
			"tasks/T-001.md": note({ type: "task", id: "T-001", canvas_source: "missing.canvas" }),
		});
		await plugin.handleMdFileModification(new TFile("tasks/T-001.md"));
		expect(plugin.fileEntityIdCache.get("tasks/T-001.md")).toBe("T-001");
	});

	it("does nothing for a non-plugin note (no canvas_source)", async () => {
		const { plugin } = makePlugin({
			"tasks/T-002.md": note({ type: "task", id: "T-002" }),
		});
		await plugin.handleMdFileModification(new TFile("tasks/T-002.md"));
		expect(plugin.fileEntityIdCache.has("tasks/T-002.md")).toBe(false);
	});

	it("skips entirely while the plugin is mid-canvas-update", async () => {
		const { plugin } = makePlugin({
			"tasks/T-003.md": note({ type: "task", id: "T-003", canvas_source: "b.canvas" }),
		});
		plugin.isUpdatingCanvas = true;
		await plugin.handleMdFileModification(new TFile("tasks/T-003.md"));
		expect(plugin.fileEntityIdCache.has("tasks/T-003.md")).toBe(false);
	});

	it("finds the referenced node but leaves the canvas untouched when the color already matches", async () => {
		const CANVAS = "board.canvas";
		// resolveNodeColor(undefined-workstream, inProgress=false) yields no color; a node
		// with no color already matches, so the save/reload branch is skipped.
		const canvas = JSON.stringify({
			nodes: [{ id: "n1", type: "file", file: "tasks/T-004.md", x: 0, y: 0, width: 100, height: 100 }],
			edges: [],
		});
		const { plugin, vault } = makePlugin({
			[CANVAS]: canvas,
			"tasks/T-004.md": note({ type: "task", id: "T-004", canvas_source: CANVAS }),
		});
		const before = vault._files.get(CANVAS);
		await plugin.handleMdFileModification(new TFile("tasks/T-004.md"));
		// entity id cached, canvas unchanged (no color churn)
		expect(plugin.fileEntityIdCache.get("tasks/T-004.md")).toBe("T-004");
		expect(vault._files.get(CANVAS)).toBe(before);
	});

	it("returns quietly when the canvas has no node referencing the file", async () => {
		const CANVAS = "board.canvas";
		const { plugin } = makePlugin({
			[CANVAS]: JSON.stringify({ nodes: [], edges: [] }),
			"tasks/T-005.md": note({ type: "task", id: "T-005", canvas_source: CANVAS }),
		});
		await plugin.handleMdFileModification(new TFile("tasks/T-005.md"));
		expect(plugin.fileEntityIdCache.get("tasks/T-005.md")).toBe("T-005");
	});
});

describe("findFileByEntityId (integration via obsidian mock)", () => {
	it("reverse-looks-up a path from the entity-id cache, or null when absent", () => {
		const { plugin } = makePlugin();
		plugin.fileEntityIdCache.set("tasks/T-100.md", "T-100");
		plugin.fileEntityIdCache.set("stories/S-1.md", "S-1");
		expect(plugin.findFileByEntityId("S-1")).toBe("stories/S-1.md");
		expect(plugin.findFileByEntityId("T-100")).toBe("tasks/T-100.md");
		expect(plugin.findFileByEntityId("nope")).toBeNull();
	});
});
