/**
 * Integration: vault-wide migration commands against the in-memory obsidian mock.
 *   - migrateDecisionFieldsInVault(): folds legacy `enables`/`blocks` on decision notes
 *     into `affects` and removes the old fields.
 *   - stripIdsFromFilenames(): renames `X-NNN_[..]_Name.md` file nodes on the active
 *     canvas to `Name.md` and rewrites the canvas node references. Uses vault.modify
 *     (not canvas render), so it's reachable via a settable active canvas file.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, TFile, Vault, Workspace } from "./harness/obsidian-mock";

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
		workspace: app.workspace as unknown as Workspace,
	};
}

describe("migrateDecisionFieldsInVault (integration via obsidian mock)", () => {
	it("migrates enables + blocks into affects and drops the old fields", async () => {
		const decision = [
			"---",
			"type: decision",
			"id: DEC-001",
			"title: Choose DB",
			"enables: [S-001, S-002]",
			"blocks: [T-010]",
			"affects: [F-001]",
			"---",
			"",
			"decision body",
		].join("\n");
		const { plugin, vault } = makePlugin({ "decisions/DEC-001.md": decision });

		await plugin.migrateDecisionFieldsInVault();

		const out = vault._files.get("decisions/DEC-001.md")!;
		// affects now holds the union (order: existing, then enables, then blocks)
		expect(out).toMatch(/affects:\s*\[.*"F-001".*"S-001".*"S-002".*"T-010".*\]/);
		// old fields removed
		expect(out).not.toMatch(/^enables:/m);
		expect(out).not.toMatch(/^blocks:/m);
		// body preserved
		expect(out).toContain("decision body");
	});

	it("adds affects after type when the decision has no existing affects field", async () => {
		const decision = [
			"---",
			"type: decision",
			"id: DEC-002",
			"enables: [S-005]",
			"---",
			"",
		].join("\n");
		const { plugin, vault } = makePlugin({ "decisions/DEC-002.md": decision });

		await plugin.migrateDecisionFieldsInVault();

		const out = vault._files.get("decisions/DEC-002.md")!;
		expect(out).toMatch(/affects:\s*\["S-005"\]/);
		expect(out).not.toMatch(/^enables:/m);
	});

	it("skips non-decision files and decisions with nothing to migrate", async () => {
		const task = ["---", "type: task", "id: T-001", "enables: [S-001]", "---", ""].join("\n");
		const cleanDecision = ["---", "type: decision", "id: DEC-003", "affects: [F-9]", "---", ""].join("\n");
		const { plugin, vault } = makePlugin({
			"decisions/T-001.md": task,
			"decisions/DEC-003.md": cleanDecision,
		});
		const taskBefore = vault._files.get("decisions/T-001.md");
		const decBefore = vault._files.get("decisions/DEC-003.md");

		await plugin.migrateDecisionFieldsInVault();

		// task untouched (wrong type); clean decision untouched (nothing to migrate)
		expect(vault._files.get("decisions/T-001.md")).toBe(taskBefore);
		expect(vault._files.get("decisions/DEC-003.md")).toBe(decBefore);
	});

	it("only scans files under the configured decisions folder", async () => {
		const decisionOutside = ["---", "type: decision", "id: DEC-004", "enables: [S-1]", "---", ""].join("\n");
		const { plugin, vault } = makePlugin({
			// not under decisions/ → ignored
			"tasks/DEC-004.md": decisionOutside,
		});
		const before = vault._files.get("tasks/DEC-004.md");

		await plugin.migrateDecisionFieldsInVault();

		expect(vault._files.get("tasks/DEC-004.md")).toBe(before);
	});
});

describe("stripIdsFromFilenames (integration via obsidian mock)", () => {
	const CANVAS = "board.canvas";

	function note(fields: Record<string, string>): string {
		const lines = ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
		return lines.join("\n");
	}

	it("renames id-prefixed file nodes and rewrites canvas references", async () => {
		const canvasData = JSON.stringify({
			nodes: [
				{ id: "n0", type: "file", file: "tasks/T-014_[C1.5]_Implement_Logger.md", x: 0, y: 0, width: 100, height: 100 },
				{ id: "n1", type: "file", file: "tasks/S-002_Plain_Story.md", x: 0, y: 0, width: 100, height: 100 },
			],
			edges: [],
		});
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: canvasData,
			"tasks/T-014_[C1.5]_Implement_Logger.md": note({ type: "task", id: "T-014" }),
			"tasks/S-002_Plain_Story.md": note({ type: "story", id: "S-002" }),
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.stripIdsFromFilenames();

		// files renamed to their stripped basenames
		expect(vault._files.has("tasks/Implement_Logger.md")).toBe(true);
		expect(vault._files.has("tasks/T-014_[C1.5]_Implement_Logger.md")).toBe(false);
		expect(vault._files.has("tasks/Plain_Story.md")).toBe(true);
		// canvas node references updated to the new paths
		const updatedCanvas = JSON.parse(vault._files.get(CANVAS)!);
		const files = updatedCanvas.nodes.map((n: { file: string }) => n.file).sort();
		expect(files).toEqual(["tasks/Implement_Logger.md", "tasks/Plain_Story.md"]);
	});

	it("does nothing when no active canvas file is set", async () => {
		const { plugin, vault } = makePlugin({
			"tasks/T-001_Name.md": note({ type: "task", id: "T-001" }),
		});
		// workspace._activeFile stays null
		await plugin.stripIdsFromFilenames();
		expect(vault._files.has("tasks/T-001_Name.md")).toBe(true);
		expect(vault._files.has("tasks/Name.md")).toBe(false);
	});

	it("skips a rename when the stripped target name already exists", async () => {
		const canvasData = JSON.stringify({
			nodes: [{ id: "n0", type: "file", file: "tasks/T-020_Report.md", x: 0, y: 0, width: 100, height: 100 }],
			edges: [],
		});
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: canvasData,
			"tasks/T-020_Report.md": note({ type: "task", id: "T-020" }),
			"tasks/Report.md": note({ type: "task", id: "T-021" }), // collision
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.stripIdsFromFilenames();

		// original kept because target existed
		expect(vault._files.has("tasks/T-020_Report.md")).toBe(true);
	});
});
