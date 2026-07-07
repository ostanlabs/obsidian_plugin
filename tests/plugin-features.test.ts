/**
 * Integration: createFeatureFile against the in-memory obsidian mock. Generates a
 * feature id, ensures the features folder, writes the templated file, and opens it via
 * a stub leaf. Also covers the delegating feature-parsing pure wrappers
 * (parseFutureFeatures, mapCategoryToPhase, titleSimilarity).
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Vault, Workspace } from "./harness/obsidian-mock";
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
		workspace: app.workspace as unknown as Workspace,
	};
}

describe("createFeatureFile (integration via obsidian mock)", () => {
	beforeEach(() => _resetSessionHighWaterForTests());

	it("creates a feature file with generated id under the features folder and opens it", async () => {
		const { plugin, vault, workspace } = makePlugin();

		await plugin.createFeatureFile({
			title: "Realtime Sync",
			workstream: "core",
			user_story: "As a user I want realtime sync",
			tier: "must-have",
			phase: "mvp",
			status: "Not Started",
			priority: "High",
			personas: ["power-user"],
			acceptance_criteria: ["syncs within 1s"],
		});

		expect(vault._folders.has("features")).toBe(true);
		const path = "features/F-001_Realtime Sync.md";
		expect(vault._files.has(path)).toBe(true);
		const fm = parseFrontmatter(vault._files.get(path)!)!;
		expect(fm.id).toBe("F-001");
		expect(fm.type).toBe("feature");
		expect(fm.title).toBe("Realtime Sync");
		// the created file is opened via a leaf
		expect(workspace.leaves.length).toBeGreaterThan(0);
		expect(workspace.leaves[0].openedFile?.path).toBe(path);
	});

	it("sanitizes illegal filename characters from the title", async () => {
		const { plugin, vault } = makePlugin();

		await plugin.createFeatureFile({
			title: "A/B: Test?",
			workstream: "core",
			user_story: "",
			tier: "nice-to-have",
			phase: "mvp",
			status: "Not Started",
			priority: "Low",
			personas: [],
			acceptance_criteria: [],
		});

		// slashes/colons/question-marks replaced with '-'
		expect(vault._files.has("features/F-001_A-B- Test-.md")).toBe(true);
	});

	it("increments the feature id when a feature already exists", async () => {
		const existing = ["---", "type: feature", "id: F-007", "title: Old", "---", ""].join("\n");
		const { plugin, vault } = makePlugin({ "features/F-007_Old.md": existing });

		await plugin.createFeatureFile({
			title: "New One",
			workstream: "core",
			user_story: "",
			tier: "must-have",
			phase: "mvp",
			status: "Not Started",
			priority: "Medium",
			personas: [],
			acceptance_criteria: [],
		});

		expect(vault._files.has("features/F-008_New One.md")).toBe(true);
	});
});

describe("feature-parsing wrappers (delegating pure helpers)", () => {
	it("parseFutureFeatures extracts features from markdown", () => {
		const { plugin } = makePlugin();
		const p = plugin as unknown as {
			parseFutureFeatures: (c: string) => Array<{ title: string }>;
			mapCategoryToPhase: (c: string) => string;
			titleSimilarity: (a: string, b: string) => number;
		};
		const md = [
			"## Phase 1 Features",
			"- [ ] Dark Mode",
			"- [x] Offline Support",
		].join("\n");
		const features = p.parseFutureFeatures(md);
		expect(features.length).toBe(2);
		expect(features.map((f) => f.title)).toEqual(expect.arrayContaining(["Dark Mode", "Offline Support"]));
		// checkbox → status; category inherited from the ## header
		const offline = features.find((f) => f.title === "Offline Support")!;
		expect(offline.status).toBe("Complete");
		expect(offline.category).toBe("Phase 1 Features");
		// category → phase mapping
		expect(p.mapCategoryToPhase("Phase 1 Features")).toBe("1");
		expect(p.mapCategoryToPhase("Future / Later")).toBe("5");
	});

	it("titleSimilarity scores identical titles high and unrelated titles low", () => {
		const { plugin } = makePlugin();
		const p = plugin as unknown as { titleSimilarity: (a: string, b: string) => number };
		expect(p.titleSimilarity("User Login", "User Login")).toBeGreaterThan(0.9);
		expect(p.titleSimilarity("User Login", "Payment Gateway Refunds")).toBeLessThan(0.4);
	});
});
