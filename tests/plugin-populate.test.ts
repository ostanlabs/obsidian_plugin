/**
 * Integration: populateCanvasFromVault + repositionCanvasNodesV4 against the in-memory
 * obsidian mock. Under the mock there are no open canvas leaves, so the close/reopen
 * render helpers are no-ops and both flows are fully vault-I/O observable.
 *   - populateCanvasFromVault(): the V2-style vault scan (parseFrontmatter at the top of
 *     the loop plus the regex/V2 secondary parse) that adds entity nodes + relationship
 *     edges to the active canvas, skips archived/duplicate/no-frontmatter files, then
 *     chains reconcile → V4 reposition → archive cleanup and writes operation-log.txt.
 *   - repositionCanvasNodesV4(): the canvas positioning read — parseEntityFromFrontmatter
 *     feeding the V4 engine — pinning the legacy `effort:`→workstream fallback and the
 *     unknown-type→task coercion quirks, and that nodes without an id are left alone.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Notice, TFile, Vault, Workspace } from "./harness/obsidian-mock";

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

function note(fields: Record<string, string>): string {
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

const CANVAS = "board.canvas";
const EMPTY_CANVAS = JSON.stringify({ nodes: [], edges: [] });

type CanvasJson = {
	nodes: Array<{
		id: string;
		type: string;
		file?: string;
		x: number;
		y: number;
		width: number;
		height: number;
		metadata?: { entityId?: string };
	}>;
	edges: Array<{ fromNode: string; toNode: string }>;
};

/** Flush the trailing isUpdatingCanvas-reset timer these flows schedule (500ms). */
const flushTimers = () => new Promise((resolve) => setTimeout(resolve, 600));

describe("populateCanvasFromVault (integration via obsidian mock)", () => {
	afterEach(flushTimers);

	it("adds vault entities as canvas nodes with relationship edges, skipping archived/plain files", async () => {
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: EMPTY_CANVAS,
			"milestones/M-1.md": note({ type: "milestone", id: "M-1" }),
			"stories/S-1.md": note({ type: "story", id: "S-1", parent: "M-1" }),
			"tasks/T-1.md": note({ type: "task", id: "T-1", parent: "S-1", depends_on: "[S-1]" }),
			// archived entity must not be added (and is later moved to the archive folder)
			"tasks/T-9.md": note({ type: "task", id: "T-9", status: "Archived" }),
			// no frontmatter -> skipped
			"notes/plain.md": "just text",
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.populateCanvasFromVault();

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		const entityIds = canvas.nodes
			.filter((n) => n.type === "file")
			.map((n) => n.metadata?.entityId)
			.sort();
		expect(entityIds).toEqual(["M-1", "S-1", "T-1"]);

		// relationship edges: T-1 parent S-1, S-1 parent M-1 (depends_on S-1 is
		// parent-implied and cleaned by the transitive-dependency pass)
		expect(canvas.edges.length).toBeGreaterThanOrEqual(2);

		const byEntity = new Map(canvas.nodes.map((n) => [n.metadata?.entityId, n.id]));
		const edgePairs = canvas.edges.map((e) => `${e.fromNode}->${e.toNode}`);
		// child -> parent edges
		expect(edgePairs).toContain(`${byEntity.get("S-1")}->${byEntity.get("M-1")}`);
		expect(edgePairs).toContain(`${byEntity.get("T-1")}->${byEntity.get("S-1")}`);

		// V4 reposition ran as STAGE 8: every entity node has a concrete position/size
		for (const n of canvas.nodes) {
			expect(Number.isFinite(n.x)).toBe(true);
			expect(Number.isFinite(n.y)).toBe(true);
			expect(n.width).toBeGreaterThan(0);
		}

		// archive cleanup (STAGE 9) moved the archived task out of tasks/
		expect(vault._files.has("tasks/T-9.md")).toBe(false);
		expect(vault._files.has("archive/tasks/T-9.md")).toBe(true);

		// operation log written
		expect(vault._files.has("operation-log.txt")).toBe(true);
		expect(vault._files.get("operation-log.txt")!).toContain("POPULATE COMPLETE");
	});

	it("does not duplicate entities already on the canvas (by path or by entity id)", async () => {
		const preSeeded = JSON.stringify({
			nodes: [
				{ id: "n0", type: "file", file: "tasks/T-1.md", x: 0, y: 0, width: 100, height: 100 },
			],
			edges: [],
		});
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: preSeeded,
			"tasks/T-1.md": note({ type: "task", id: "T-1" }),
			// same entity id under a different path -> duplicate, skipped
			"tasks/T-1-copy.md": note({ type: "task", id: "T-1" }),
			"tasks/T-2.md": note({ type: "task", id: "T-2" }),
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.populateCanvasFromVault();

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		const files = canvas.nodes.filter((n) => n.type === "file").map((n) => n.file).sort();
		expect(files).toEqual(["tasks/T-1.md", "tasks/T-2.md"]);
	});

	it("notices and returns when no canvas file is active", async () => {
		Notice.instances = [];
		const { plugin } = makePlugin({
			"tasks/T-1.md": note({ type: "task", id: "T-1" }),
		});
		// no active file
		await plugin.populateCanvasFromVault();
		expect(Notice.instances).toContain("Please open a canvas file first");
	});

	it("notices when the vault has no new entities to add", async () => {
		Notice.instances = [];
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: EMPTY_CANVAS,
			"notes/plain.md": "no entities here",
		});
		workspace._activeFile = new TFile(CANVAS);
		const before = vault._files.get(CANVAS);

		await plugin.populateCanvasFromVault();

		expect(Notice.instances).toContain("No new entities found to add to canvas");
		expect(vault._files.get(CANVAS)).toBe(before);
	});
});

describe("repositionCanvasNodesV4 (integration via obsidian mock)", () => {
	function canvasWith(files: string[]): string {
		return JSON.stringify({
			nodes: files.map((f, i) => ({
				id: `n${i}`,
				type: "file",
				file: f,
				x: 0,
				y: 0,
				width: 1,
				height: 1,
			})),
			edges: [],
		});
	}

	it("parses entities from node frontmatter and applies engine positions to the canvas file", async () => {
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: canvasWith(["M.md", "S.md", "T.md"]),
			"M.md": note({ type: "milestone", id: "M-1", workstream: "core" }),
			"S.md": note({ type: "story", id: "S-1", parent: "M-1", workstream: "core" }),
			"T.md": note({ type: "task", id: "T-1", parent: "S-1", workstream: "core" }),
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.repositionCanvasNodesV4();

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		// every node was repositioned/resized away from the 0/0/1x1 seed
		for (const n of canvas.nodes) {
			expect(n.width).toBeGreaterThan(1);
			expect(n.height).toBeGreaterThan(1);
		}
		// hierarchy fan-out: children are placed to the LEFT of their milestone,
		// and all three occupy distinct, non-overlapping-origin positions
		const m = canvas.nodes.find((n) => n.file === "M.md")!;
		const s = canvas.nodes.find((n) => n.file === "S.md")!;
		const t = canvas.nodes.find((n) => n.file === "T.md")!;
		expect(s.x).toBeLessThan(m.x);
		expect(t.x).toBeLessThan(m.x);
		const origins = new Set(canvas.nodes.map((n) => `${n.x},${n.y}`));
		expect(origins.size).toBe(3);
	});

	it("ignores the legacy `effort:` field; missing workstream gets the schema default lane (§5.3 reconciled)", async () => {
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: canvasWith(["A.md", "B.md"]),
			// No workstream field. Pre-convergence, the legacy parser fell back to
			// `effort:` (alpha/beta -> two lanes). The canonical EntityParser applies
			// the schema default workstream instead, so both land in ONE lane.
			"A.md": note({ type: "milestone", id: "M-1", effort: "alpha" }),
			"B.md": note({ type: "milestone", id: "M-2", effort: "beta" }),
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.repositionCanvasNodesV4();

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		const a = canvas.nodes.find((n) => n.file === "A.md")!;
		const b = canvas.nodes.find((n) => n.file === "B.md")!;
		// same (default 'engineering') workstream -> same horizontal lane, and
		// both actually positioned by the engine
		expect(a.y).toBe(b.y);
		expect(a.width).toBeGreaterThan(1);
		expect(b.width).toBeGreaterThan(1);
		expect(a.x).not.toBe(b.x);
	});

	it("keeps an unknown entity type literal; the engine has no rules for it and leaves the node untouched (§5.3 reconciled)", async () => {
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: canvasWith(["E.md"]),
			// Pre-convergence, the legacy parser coerced unknown types to 'task'
			// and positioned them. The canonical EntityParser keeps the literal
			// type ('epic'); no positioning rules exist for it, so the node keeps
			// its manual geometry (the validator, not the layout engine, is the
			// component that flags unknown types).
			"E.md": note({ type: "epic", id: "E-1", workstream: "core" }),
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.repositionCanvasNodesV4();

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		const e = canvas.nodes.find((n) => n.file === "E.md")!;
		expect(e.x).toBe(0);
		expect(e.y).toBe(0);
		expect(e.width).toBe(1);
	});

	it("leaves nodes without an id in frontmatter untouched (parse returns null)", async () => {
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: canvasWith(["ok.md", "noid.md"]),
			"ok.md": note({ type: "task", id: "T-1", workstream: "core" }),
			"noid.md": ["---", "type: task", "title: no id here", "---", ""].join("\n"),
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.repositionCanvasNodesV4();

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		const noid = canvas.nodes.find((n) => n.file === "noid.md")!;
		// unparseable entity -> engine never saw it -> seed geometry kept
		expect(noid.x).toBe(0);
		expect(noid.y).toBe(0);
		expect(noid.width).toBe(1);
		const ok = canvas.nodes.find((n) => n.file === "ok.md")!;
		expect(ok.width).toBeGreaterThan(1);
	});
});
