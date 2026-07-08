/**
 * ui/FeatureDetailsView + ui/FeatureCoverageView against the obsidian mock
 * (Phase 4 of docs/ENTITY_MODEL_CONVERGENCE_SPEC.md).
 *
 * The views no longer import util/frontmatter.parseAnyFrontmatter; they
 * receive the canonical parse (entity-core EntityParser → model-map
 * toFlatFrontmatter, legacy null contract) as a constructor-injected function
 * — exactly the closure main.ts hands them from parseAnyEntityFrontmatter.
 * These tests pin that the injected canonical parse feeds the views the same
 * rendered state the legacy parser did: field values, array relationships,
 * view-side fallbacks (tier 'OSS', phase 'MVP'), the type!=="feature" gate,
 * and null-parse skips.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import { FeatureDetailsView, ParseEntityFrontmatterFn } from "../ui/FeatureDetailsView";
import { FeatureCoverageView } from "../ui/FeatureCoverageView";
import { createTestApp, WorkspaceLeaf, TFile, App } from "./harness/obsidian-mock";
import { EntityParser } from "../src/entity-core/parser";
import { SchemaRegistry } from "../src/entity-core/schema-registry";
import { DEFAULT_SCHEMA } from "../src/entity-core/default-schema";
import { toFlatFrontmatter } from "../src/adapters/model-map";
import { FeatureFrontmatter } from "../types";

// Same wiring main.ts's parseAnyEntityFrontmatter helper uses (facade-less).
const parser = new EntityParser(new SchemaRegistry(DEFAULT_SCHEMA));
const parseEntityFm: ParseEntityFrontmatterFn = (content, path) => {
	try {
		const entity = parser.parse(content, path);
		if (!entity.id || !entity.type) return null;
		return toFlatFrontmatter(entity);
	} catch {
		return null;
	}
};

const FEATURE_MD = [
	"---",
	"id: F-001",
	"type: feature",
	"title: Alpha",
	"tier: Premium",
	'phase: "1"',
	"status: In Progress",
	"user_story: As a user I want alpha",
	"implemented_by:",
	'  - "S-001"',
	"  - S-002",
	"documented_by:",
	"  - DOC-001",
	"test_refs:",
	"  - tests/foo.test.ts",
	"personas:",
	"  - dev",
	"---",
	"# Alpha",
].join("\n");

/** Feature with only the required keys — view-side fallbacks must kick in. */
const BARE_FEATURE_MD = [
	"---",
	"id: F-002",
	"type: feature",
	"title: Bare",
	"---",
].join("\n");

const TASK_MD = ["---", "id: T-001", "type: task", "title: A task", "---"].join("\n");

/** Unquoted colon in a value — strict YAML throws, canonical parse → null. */
const BROKEN_MD = ["---", "id: F-009", "type: feature", "title: Bad: colon", "---"].join("\n");

function fileOf(app: App, path: string): TFile {
	return app.vault.getAbstractFileByPath(path) as TFile;
}

describe("FeatureDetailsView (canonical parse injection)", () => {
	function makeView(app: App): FeatureDetailsView {
		const view = new FeatureDetailsView(new WorkspaceLeaf(), parseEntityFm);
		(view as unknown as { app: App }).app = app;
		return view;
	}

	it("showFeature loads the flat projection into currentFeature", async () => {
		const app = createTestApp({ "features/F-001_Alpha.md": FEATURE_MD });
		const view = makeView(app);

		await view.showFeature(fileOf(app, "features/F-001_Alpha.md"));

		const f = (view as unknown as { currentFeature: FeatureFrontmatter }).currentFeature;
		expect(f).not.toBeNull();
		expect(f.id).toBe("F-001");
		expect(f.title).toBe("Alpha");
		expect(f.tier).toBe("Premium");
		expect(String(f.phase)).toBe("1");
		expect(f.status).toBe("In Progress");
		expect(f.user_story).toBe("As a user I want alpha");
		// YAML.parse unquotes quoted ids — same result the legacy
		// sanitizeAllRelationships pass produced.
		expect(f.implemented_by).toEqual(["S-001", "S-002"]);
		expect(f.documented_by).toEqual(["DOC-001"]);
		expect(f.personas).toEqual(["dev"]);
	});

	it("canonical system defaults align with the view's rendering fallbacks", async () => {
		const app = createTestApp({ "features/F-002_Bare.md": BARE_FEATURE_MD });
		const view = makeView(app);

		await view.showFeature(fileOf(app, "features/F-002_Bare.md"));

		const f = (view as unknown as { currentFeature: FeatureFrontmatter }).currentFeature;
		// EntityParser injects the schema default status — identical to the
		// view's own `f.status || "Planned"` fallback.
		expect(f.status).toBe("Planned");
		// tier/phase are absent (no schema default injected) — the view's
		// "OSS"/"MVP" fallbacks still apply at render time.
		expect(f.tier).toBeUndefined();
		expect(f.phase).toBeUndefined();
	});

	it("updateFromActiveFile gates on the feature type", async () => {
		const app = createTestApp({
			"features/F-001_Alpha.md": FEATURE_MD,
			// task with a feature-looking basename must be rejected by type
			"tasks/F-100_Task.md": TASK_MD,
		});
		const view = makeView(app);

		app.workspace._activeFile = fileOf(app, "tasks/F-100_Task.md");
		await (view as unknown as { updateFromActiveFile(): Promise<void> }).updateFromActiveFile();
		expect((view as unknown as { currentFeature: unknown }).currentFeature).toBeNull();

		app.workspace._activeFile = fileOf(app, "features/F-001_Alpha.md");
		await (view as unknown as { updateFromActiveFile(): Promise<void> }).updateFromActiveFile();
		const f = (view as unknown as { currentFeature: FeatureFrontmatter }).currentFeature;
		expect(f.id).toBe("F-001");
	});

	it("coerces scalar-valued legacy array fields (hand-written frontmatter)", async () => {
		const md = [
			"---",
			"id: F-004",
			"type: feature",
			"title: Scalar",
			"implemented_by: S-001",
			"personas: dev",
			"---",
		].join("\n");
		const app = createTestApp({ "features/F-004_Scalar.md": md });
		const view = makeView(app);

		await view.showFeature(fileOf(app, "features/F-004_Scalar.md"));

		const f = (view as unknown as { currentFeature: FeatureFrontmatter }).currentFeature;
		// The legacy parser array-coerced these on read; the views reproduce
		// that (coerceLegacyArrayFields) so .join/.length rendering is identical.
		expect(f.implemented_by).toEqual(["S-001"]);
		expect(f.personas).toEqual(["dev"]);
	});

	it("null parse (invalid YAML) leaves the view state untouched", async () => {
		const app = createTestApp({ "features/F-009_Bad.md": BROKEN_MD });
		const view = makeView(app);

		await view.showFeature(fileOf(app, "features/F-009_Bad.md"));

		expect((view as unknown as { currentFeature: unknown }).currentFeature).toBeNull();
	});
});

describe("FeatureCoverageView (canonical parse injection)", () => {
	function makeView(app: App): FeatureCoverageView {
		const view = new FeatureCoverageView(new WorkspaceLeaf(), parseEntityFm);
		(view as unknown as { app: App }).app = app;
		return view;
	}

	type Entry = {
		id: string;
		title: string;
		tier: string;
		phase: string | number;
		status: string;
		implementedByCount: number;
		documentedByCount: number;
		decidedByCount: number;
		hasTests: boolean;
	};

	it("loadFeatures builds coverage entries from the canonical parse", async () => {
		const app = createTestApp({
			"features/F-001_Alpha.md": FEATURE_MD,
			"features/F-002_Bare.md": BARE_FEATURE_MD,
			// non-feature type and non-matching basename are both excluded
			"tasks/F-100_Task.md": TASK_MD,
			"features/Beta.md": FEATURE_MD.replace("F-001", "F-003"),
		});
		const view = makeView(app);

		await view.onOpen(); // loadFeatures + render (stub DOM)

		const features = (view as unknown as { features: Entry[] }).features;
		expect(features.map((f) => f.id)).toEqual(["F-001", "F-002"]);

		const [alpha, bare] = features;
		expect(alpha).toMatchObject({
			title: "Alpha",
			tier: "Premium",
			status: "In Progress",
			implementedByCount: 2,
			documentedByCount: 1,
			decidedByCount: 0,
			hasTests: true,
		});
		expect(String(alpha.phase)).toBe("1");

		// Bare feature: view fallbacks for tier/phase, schema default status,
		// zero counts, no tests.
		expect(bare).toMatchObject({
			title: "Bare",
			tier: "OSS",
			phase: "MVP",
			status: "Planned",
			implementedByCount: 0,
			documentedByCount: 0,
			hasTests: false,
		});
	});

	it("skips files the canonical parse rejects (invalid YAML)", async () => {
		const app = createTestApp({
			"features/F-001_Alpha.md": FEATURE_MD,
			"features/F-009_Bad.md": BROKEN_MD,
		});
		const view = makeView(app);

		await view.onOpen();

		const features = (view as unknown as { features: Entry[] }).features;
		expect(features.map((f) => f.id)).toEqual(["F-001"]);
	});
});
