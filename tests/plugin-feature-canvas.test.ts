/**
 * Integration: the feature-management flows (the parseAnyFrontmatter call sites in
 * main.ts) against the in-memory obsidian mock.
 *   - setFeatureTier(): OSS↔Premium toggle on the active feature file.
 *   - setFeaturePhase(): phase write (the modal selector is stubbed on the instance).
 *   - populateFeaturesCanvas(): scans F-* files and adds tier/phase-positioned nodes.
 *   - autoLayoutFeaturesCanvas(): repositions feature nodes by tier/phase and creates
 *     depends_on edges between features.
 *   - linkCurrentEntityToFeature(): eligibility gating (early returns).
 *   - applyFeatureLink(): forward-link write + reconcile-driven reverse link.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Notice, TFile, Vault, Workspace } from "./harness/obsidian-mock";
import { parseRawFrontmatter, parseAnyFrontmatter } from "../util/frontmatter";

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

const CANVAS = "features/features.canvas";
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

beforeEach(() => {
	Notice.instances = [];
});

describe("setFeatureTier (integration via obsidian mock)", () => {
	it("toggles the active feature's tier OSS -> Premium -> OSS", async () => {
		const { plugin, vault, workspace } = makePlugin({
			"features/F-001_X.md": note({ type: "feature", id: "F-001", tier: "OSS" }),
		});
		workspace._activeFile = new TFile("features/F-001_X.md");

		await plugin.setFeatureTier();
		let fm = parseAnyFrontmatter(vault._files.get("features/F-001_X.md")!)!;
		expect(fm.tier).toBe("Premium");
		expect(fm.updated_at).toBeTruthy();

		await plugin.setFeatureTier();
		fm = parseAnyFrontmatter(vault._files.get("features/F-001_X.md")!)!;
		expect(fm.tier).toBe("OSS");
	});

	it("defaults a missing tier to OSS and flips it to Premium", async () => {
		const { plugin, vault, workspace } = makePlugin({
			"features/F-002_Y.md": note({ type: "feature", id: "F-002" }),
		});
		workspace._activeFile = new TFile("features/F-002_Y.md");

		await plugin.setFeatureTier();

		expect(parseAnyFrontmatter(vault._files.get("features/F-002_Y.md")!)!.tier).toBe("Premium");
	});

	it("refuses to run on a non-feature file", async () => {
		const { plugin, vault, workspace } = makePlugin({
			"tasks/T-001.md": note({ type: "task", id: "T-001" }),
		});
		workspace._activeFile = new TFile("tasks/T-001.md");
		const before = vault._files.get("tasks/T-001.md");

		await plugin.setFeatureTier();

		expect(vault._files.get("tasks/T-001.md")).toBe(before);
		expect(Notice.instances).toContain("Current file is not a feature");
	});
});

describe("setFeaturePhase (integration via obsidian mock)", () => {
	it("writes the phase chosen in the selector", async () => {
		const { plugin, vault, workspace } = makePlugin({
			"features/F-001_X.md": note({ type: "feature", id: "F-001", phase: "MVP" }),
		});
		workspace._activeFile = new TFile("features/F-001_X.md");
		// the phase-selector modal can't run headless; stub the selection
		(plugin as Record<string, unknown>).showPhaseSelector = async () => "2";

		await plugin.setFeaturePhase();

		const fm = parseAnyFrontmatter(vault._files.get("features/F-001_X.md")!)!;
		expect(String(fm.phase)).toBe("2");
		expect(fm.updated_at).toBeTruthy();
	});

	it("does not write when the selected phase equals the current one", async () => {
		const { plugin, vault, workspace } = makePlugin({
			"features/F-001_X.md": note({ type: "feature", id: "F-001", phase: "MVP" }),
		});
		workspace._activeFile = new TFile("features/F-001_X.md");
		(plugin as Record<string, unknown>).showPhaseSelector = async () => "MVP";
		const before = vault._files.get("features/F-001_X.md");

		await plugin.setFeaturePhase();

		expect(vault._files.get("features/F-001_X.md")).toBe(before);
	});

	it("refuses to run on a non-feature file", async () => {
		const { plugin, workspace } = makePlugin({
			"tasks/T-001.md": note({ type: "task", id: "T-001" }),
		});
		workspace._activeFile = new TFile("tasks/T-001.md");

		await plugin.setFeaturePhase();

		expect(Notice.instances).toContain("Current file is not a feature");
	});
});

describe("populateFeaturesCanvas (integration via obsidian mock)", () => {
	it("adds F-* feature files as nodes positioned by tier and phase", async () => {
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: EMPTY_CANVAS,
			"features/F-001_Alpha.md": note({ type: "feature", id: "F-001", tier: "OSS", phase: "MVP" }),
			"features/F-002_Beta.md": note({ type: "feature", id: "F-002", tier: "Premium", phase: "1" }),
			// not F-prefixed -> ignored
			"features/notes.md": note({ type: "task", id: "T-001" }),
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.populateFeaturesCanvas();

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		expect(canvas.nodes).toHaveLength(2);
		const f1 = canvas.nodes.find((n) => n.file === "features/F-001_Alpha.md")!;
		const f2 = canvas.nodes.find((n) => n.file === "features/F-002_Beta.md")!;
		expect(f1.metadata?.entityId).toBe("F-001");
		// OSS/MVP column x=0; Premium offset 2200 + phase-1 column 700
		expect(f1.x).toBe(0);
		expect(f2.x).toBe(2900);
		expect(Notice.instances.join("\n")).toContain("Added 2 feature nodes to canvas");
	});

	it("skips features already on the canvas (by file path)", async () => {
		const preSeeded = JSON.stringify({
			nodes: [
				{ id: "n0", type: "file", file: "features/F-001_Alpha.md", x: 0, y: 140, width: 390, height: 165 },
			],
			edges: [],
		});
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: preSeeded,
			"features/F-001_Alpha.md": note({ type: "feature", id: "F-001" }),
		});
		workspace._activeFile = new TFile(CANVAS);
		const before = vault._files.get(CANVAS);

		await plugin.populateFeaturesCanvas();

		expect(vault._files.get(CANVAS)).toBe(before);
		expect(Notice.instances).toContain("No new features to add");
	});
});

describe("autoLayoutFeaturesCanvas (integration via obsidian mock)", () => {
	it("repositions feature nodes into tier/phase columns and adds depends_on edges", async () => {
		const seeded = JSON.stringify({
			nodes: [
				{ id: "n0", type: "file", file: "features/F-001_Alpha.md", x: 999, y: 999, width: 10, height: 10, metadata: { entityId: "F-001" } },
				{ id: "n1", type: "file", file: "features/F-002_Beta.md", x: 999, y: 999, width: 10, height: 10, metadata: { entityId: "F-002" } },
			],
			edges: [],
		});
		const { plugin, vault, workspace } = makePlugin({
			[CANVAS]: seeded,
			"features/F-001_Alpha.md": note({ type: "feature", id: "F-001", tier: "OSS", phase: "MVP" }),
			"features/F-002_Beta.md": note({
				type: "feature",
				id: "F-002",
				tier: "OSS",
				phase: "1",
				depends_on: "[F-001]",
			}),
		});
		workspace._activeFile = new TFile(CANVAS);

		await plugin.autoLayoutFeaturesCanvas();

		const canvas = JSON.parse(vault._files.get(CANVAS)!) as CanvasJson;
		const f1 = canvas.nodes.find((n) => n.id === "n0")!;
		const f2 = canvas.nodes.find((n) => n.id === "n1")!;
		// OSS columns: MVP at x=0, phase 1 at x=700; both below the headers at y=140
		expect(f1.x).toBe(0);
		expect(f1.y).toBe(140);
		expect(f2.x).toBe(700);
		// F-002 depends_on F-001 -> edge FROM the dependency TO the dependent
		expect(canvas.edges).toHaveLength(1);
		expect(canvas.edges[0].fromNode).toBe("n0");
		expect(canvas.edges[0].toNode).toBe("n1");
		expect(Notice.instances.join("\n")).toContain("Repositioned 2 feature nodes, added 1 dependency edges");
	});

	it("notices when the canvas has no feature nodes", async () => {
		const { plugin, workspace } = makePlugin({ [CANVAS]: EMPTY_CANVAS });
		workspace._activeFile = new TFile(CANVAS);

		await plugin.autoLayoutFeaturesCanvas();

		expect(Notice.instances).toContain("No feature nodes found on canvas");
	});
});

describe("linkCurrentEntityToFeature gating (integration via obsidian mock)", () => {
	it("rejects a file without valid entity frontmatter", async () => {
		const { plugin, workspace } = makePlugin({ "notes/plain.md": "no frontmatter" });
		workspace._activeFile = new TFile("notes/plain.md");

		await plugin.linkCurrentEntityToFeature();

		expect(Notice.instances).toContain("This file does not have valid entity frontmatter");
	});

	it("rejects linking a feature to another feature", async () => {
		const { plugin, workspace } = makePlugin({
			"features/F-001_X.md": note({ type: "feature", id: "F-001" }),
		});
		workspace._activeFile = new TFile("features/F-001_X.md");

		await plugin.linkCurrentEntityToFeature();

		expect(Notice.instances).toContain("Features cannot be linked to other features using this command");
	});

	it("notices when the vault has no features to link to", async () => {
		const { plugin, workspace } = makePlugin({
			"stories/S-001.md": note({ type: "story", id: "S-001" }),
		});
		workspace._activeFile = new TFile("stories/S-001.md");

		await plugin.linkCurrentEntityToFeature();

		expect(Notice.instances).toContain("No features found in vault. Create a feature first.");
	});
});

describe("applyFeatureLink (integration via obsidian mock)", () => {
	it("adds the feature id to the relationship field and reconciles the reverse link", async () => {
		const { plugin, vault } = makePlugin({
			"stories/S-001.md": note({ type: "story", id: "S-001" }),
			"features/F-001_X.md": note({ type: "feature", id: "F-001" }),
		});

		await plugin.applyFeatureLink(new TFile("stories/S-001.md"), "S-001", {
			featureId: "F-001",
			relationshipType: "implements",
		});

		const story = parseRawFrontmatter(vault._files.get("stories/S-001.md")!)!;
		expect(story.implements).toEqual(["F-001"]);
		// reconcileAllRelationships wrote the reverse edge onto the feature
		const feature = parseRawFrontmatter(vault._files.get("features/F-001_X.md")!)!;
		expect(feature.implemented_by).toEqual(["S-001"]);
		expect(Notice.instances.join("\n")).toContain("Linked S-001 to F-001 (implements)");
	});

	it("does not duplicate an existing link", async () => {
		const { plugin, vault } = makePlugin({
			"stories/S-002.md": note({ type: "story", id: "S-002", implements: "[F-001]" }),
			"features/F-001_X.md": note({ type: "feature", id: "F-001", implemented_by: "[S-002]" }),
		});

		await plugin.applyFeatureLink(new TFile("stories/S-002.md"), "S-002", {
			featureId: "F-001",
			relationshipType: "implements",
		});

		const story = parseRawFrontmatter(vault._files.get("stories/S-002.md")!)!;
		expect(story.implements).toEqual(["F-001"]);
	});
});
