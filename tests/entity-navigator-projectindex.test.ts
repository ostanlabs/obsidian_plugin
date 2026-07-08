/**
 * Phase 3 parity suite (docs/ENTITY_MODEL_CONVERGENCE_SPEC.md §5/§6):
 * util/entityNavigator's EntityIndex is now internally backed by entity-core's
 * ProjectIndex + EntityParser. These tests pin the behaviors most at risk in
 * that migration, on top of the black-box coverage in entityNavigator.test.ts:
 *
 *  - schema-less relationship keys (feature-side depends_on/blocks/decided_by,
 *    deprecated enables, milestone parent) ride RuntimeEntity.passthrough and
 *    must still produce graph edges / query results;
 *  - custom FIELDS that shadow relationship names (decision's `decided_by`
 *    person field) must NOT produce edges;
 *  - incremental updates (updateFile) must not destroy reverse edges owned by
 *    other entities (ProjectIndex.delete would; removeForwardRelationships is
 *    the correct primitive);
 *  - id→TFile mapping survives update/remove/rename-of-identity.
 */

jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import { EntityIndex } from "../util/entityNavigator";
import { createTestApp } from "./harness/obsidian-mock";

function fm(fields: Record<string, unknown>): string {
	const lines = Object.entries(fields).map(([k, v]) =>
		Array.isArray(v) ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`
	);
	return `---\n${lines.join("\n")}\n---\nBody\n`;
}

async function build(seed: Record<string, string>) {
	const app = createTestApp(seed);
	const idx = new EntityIndex(app as any, {} as any);
	await idx.buildIndex();
	return { app, idx };
}

const fileOf = (app: any, path: string) =>
	app.vault.getAbstractFileByPath(path) as any;

describe("EntityIndex over ProjectIndex — feature passthrough edges", () => {
	const seed = {
		"features/F-001.md": fm({
			id: "F-001", type: "feature", title: "Feat1", user_story: "as a user",
			tier: "OSS", phase: "MVP",
			implemented_by: ["M-001"], documented_by: ["DOC-001"],
			decided_by: ["DEC-001"], blocks: ["F-002"],
		}),
		"features/F-002.md": fm({
			id: "F-002", type: "feature", title: "Feat2", user_story: "as a dev",
			tier: "Premium", phase: 1, depends_on: ["F-001"],
		}),
		"milestones/M-001.md": fm({ id: "M-001", type: "milestone", title: "M" }),
		"documents/DOC-001.md": fm({ id: "DOC-001", type: "document", title: "Doc" }),
		"decisions/DEC-001.md": fm({ id: "DEC-001", type: "decision", title: "Dec" }),
	};

	it("feature depends_on (schema-less → passthrough) still drives getFeatureDependents and getDependents", async () => {
		const { idx } = await build(seed);
		expect(idx.getFeatureDependents("F-001").map((e) => e.id)).toEqual(["F-002"]);
		expect(idx.getDependents("F-001").map((e) => e.id)).toEqual(["F-002"]);
		expect(idx.getDependencies("F-002").map((e) => e.id)).toEqual(["F-001"]);
	});

	it("feature blocks (schema-less → passthrough) still drives getBlockedFeatures", async () => {
		const { idx } = await build(seed);
		expect(idx.getBlockedFeatures("F-001").map((e) => e.id)).toEqual(["F-002"]);
		expect(idx.getBlockedFeatures("F-002")).toEqual([]);
	});

	it("feature decided_by (schema-less → passthrough) still drives getFeatureDecisions", async () => {
		const { idx } = await build(seed);
		expect(idx.getFeatureDecisions("F-001").map((e) => e.id)).toEqual(["DEC-001"]);
	});

	it("feature implemented_by/documented_by (schema relationships) work end to end", async () => {
		const { idx } = await build(seed);
		expect(idx.getFeatureImplementors("F-001").map((e) => e.id)).toEqual(["M-001"]);
		expect(idx.getFeatureDocuments("F-001").map((e) => e.id)).toEqual(["DOC-001"]);
		expect(idx.getFeaturesImplementedBy("M-001").map((e) => e.id)).toEqual(["F-001"]);
	});

	it("materialized entries expose the relationship arrays main.ts reads directly", async () => {
		const { idx } = await build(seed);
		const f1 = idx.get("F-001")!;
		expect(f1.implemented_by).toEqual(["M-001"]);
		expect(f1.documented_by).toEqual(["DOC-001"]);
		expect(f1.decided_by).toEqual(["DEC-001"]);
		expect(f1.blocks).toEqual(["F-002"]);
		expect(f1.tier).toBe("OSS");
		expect(f1.phase).toBe("MVP");
	});

	it("YAML-numeric phase is coerced to the string the tier/phase filters compare", async () => {
		const { idx } = await build(seed);
		// F-002 has `phase: 1` (a YAML number after real parsing)
		expect(idx.getFeaturesByPhase("1").map((e) => e.id)).toEqual(["F-002"]);
		expect(idx.getFeaturesByTier("Premium").map((e) => e.id)).toEqual(["F-002"]);
	});
});

describe("EntityIndex over ProjectIndex — shadowed custom fields", () => {
	it("decision's decided_by PERSON field (schema custom field) does not create edges", async () => {
		const { idx } = await build({
			"decisions/DEC-001.md": fm({
				id: "DEC-001", type: "decision", title: "Dec",
				decided_by: "Jane Doe", // person, not an entity id
				affects: ["DOC-001"],
			}),
			"documents/DOC-001.md": fm({ id: "DOC-001", type: "document", title: "Doc" }),
		});
		const dec = idx.get("DEC-001")!;
		// custom field lives in entity.fields, not the graph → no phantom edge
		expect(dec.decided_by).toEqual([]);
		// but the decision's real `affects` relationship is captured
		expect(dec.affects).toEqual(["DOC-001"]);
	});

	it("milestone parent (schema-less → passthrough) still drives getParent/getChildren", async () => {
		const { idx } = await build({
			"milestones/M-001.md": fm({ id: "M-001", type: "milestone", title: "Root" }),
			"milestones/M-002.md": fm({ id: "M-002", type: "milestone", title: "Child", parent: "M-001" }),
		});
		expect(idx.getParent("M-002")?.id).toBe("M-001");
		expect(idx.getChildren("M-001").map((e) => e.id)).toEqual(["M-002"]);
	});
});

describe("EntityIndex over ProjectIndex — incremental updates keep reverse edges", () => {
	it("updateFile on a dependency TARGET preserves other entities' edges to it", async () => {
		const { app, idx } = await build({
			"S-001.md": fm({ id: "S-001", type: "story", title: "A" }),
			"S-002.md": fm({ id: "S-002", type: "story", title: "B", depends_on: ["S-001"] }),
		});
		// Re-save S-001 (e.g. title edit) — the metadataCache 'changed' flow.
		await app.vault.modify(
			fileOf(app, "S-001.md"),
			fm({ id: "S-001", type: "story", title: "A renamed" })
		);
		await idx.updateFile(fileOf(app, "S-001.md"));
		expect(idx.get("S-001")?.title).toBe("A renamed");
		// The reverse edge owned by S-002 must survive S-001's re-index.
		expect(idx.getDependents("S-001").map((e) => e.id)).toEqual(["S-002"]);
		expect(idx.getDependencies("S-002").map((e) => e.id)).toEqual(["S-001"]);
	});

	it("updateFile on a feature TARGET preserves getImplementors' reverse direction", async () => {
		const { app, idx } = await build({
			"F-001.md": fm({ id: "F-001", type: "feature", title: "F", user_story: "u", implemented_by: ["M-002"] }),
			"M-001.md": fm({ id: "M-001", type: "milestone", title: "M1", implements: ["F-001"] }),
			"M-002.md": fm({ id: "M-002", type: "milestone", title: "M2" }),
		});
		await app.vault.modify(
			fileOf(app, "F-001.md"),
			fm({ id: "F-001", type: "feature", title: "F v2", user_story: "u", implemented_by: ["M-002"] })
		);
		await idx.updateFile(fileOf(app, "F-001.md"));
		// both directions, deduped, still intact after the target re-indexed
		expect(idx.getImplementors("F-001").map((e) => e.id).sort()).toEqual(["M-001", "M-002"]);
	});

	it("updateFile replaces the entity's own stale forward edges", async () => {
		const { app, idx } = await build({
			"S-001.md": fm({ id: "S-001", type: "story", title: "A" }),
			"S-002.md": fm({ id: "S-002", type: "story", title: "B" }),
			"S-003.md": fm({ id: "S-003", type: "story", title: "C", depends_on: ["S-001"] }),
		});
		await app.vault.modify(
			fileOf(app, "S-003.md"),
			fm({ id: "S-003", type: "story", title: "C", depends_on: ["S-002"] })
		);
		await idx.updateFile(fileOf(app, "S-003.md"));
		expect(idx.getDependencies("S-003").map((e) => e.id)).toEqual(["S-002"]);
		expect(idx.getDependents("S-001")).toEqual([]);
		expect(idx.getDependents("S-002").map((e) => e.id)).toEqual(["S-003"]);
	});

	it("updateFile with a changed id retires the old identity", async () => {
		const { app, idx } = await build({
			"T-001.md": fm({ id: "T-001", type: "task", title: "T" }),
		});
		await app.vault.modify(
			fileOf(app, "T-001.md"),
			fm({ id: "T-002", type: "task", title: "T" })
		);
		await idx.updateFile(fileOf(app, "T-001.md"));
		expect(idx.get("T-001")).toBeUndefined();
		expect(idx.get("T-002")?.title).toBe("T");
		expect(idx.getFromFile(fileOf(app, "T-001.md"))?.id).toBe("T-002");
		expect(idx.getFile("T-002")?.path).toBe("T-001.md");
	});

	it("updateFile drops a file that stopped being an entity", async () => {
		const { app, idx } = await build({
			"T-001.md": fm({ id: "T-001", type: "task", title: "T" }),
		});
		await app.vault.modify(fileOf(app, "T-001.md"), "Just a note now.\n");
		await idx.updateFile(fileOf(app, "T-001.md"));
		expect(idx.get("T-001")).toBeUndefined();
		expect(idx.getAll()).toEqual([]);
	});

	it("removeFile deletes the entity and dangling references are filtered from lookups", async () => {
		const { app, idx } = await build({
			"S-001.md": fm({ id: "S-001", type: "story", title: "A" }),
			"S-002.md": fm({ id: "S-002", type: "story", title: "B", depends_on: ["S-001"] }),
		});
		idx.removeFile(fileOf(app, "S-001.md"));
		expect(idx.get("S-001")).toBeUndefined();
		expect(idx.getFile("S-001")).toBeUndefined();
		// S-002 still resolves; its dangling dep is filtered out on materialization
		expect(idx.getDependencies("S-002")).toEqual([]);
	});
});

describe("EntityIndex over ProjectIndex — content-based scan (metadataCache retired)", () => {
	it("indexes from file content: no frontmatter → skipped, entity → indexed", async () => {
		const { idx } = await build({
			"notes/plain.md": "No frontmatter here.\n",
			"tasks/T-001.md": fm({ id: "T-001", type: "task", title: "T" }),
		});
		expect(idx.getAll().map((e) => e.id)).toEqual(["T-001"]);
	});

	it("derives id from the basename and type from the id prefix (legacy files)", async () => {
		const { idx } = await build({
			// no id key in frontmatter
			"tasks/T-042 Something.md": "---\ntitle: From Name\n---\nBody\n",
		});
		const entry = idx.get("T-042");
		expect(entry?.title).toBe("From Name");
		expect(entry?.type).toBe("task");
		expect(idx.getFile("T-042")?.path).toBe("tasks/T-042 Something.md");
	});

	it("skips ids that do not match the entity ID patterns", async () => {
		const { idx } = await build({
			"weird.md": fm({ id: "X-123", type: "task", title: "Nope" }),
			"short.md": fm({ id: "T-1", type: "task", title: "Too short" }),
		});
		expect(idx.getAll()).toEqual([]);
	});

	it("getEnabledEntities / getRelatedDecisions still work via the schema-less enables key", async () => {
		const { idx } = await build({
			"S-001.md": fm({ id: "S-001", type: "story", title: "S", depends_on: ["DEC-001"] }),
			"DEC-001.md": fm({ id: "DEC-001", type: "decision", title: "D1" }),
			"DEC-002.md": fm({ id: "DEC-002", type: "decision", title: "D2", enables: ["S-001"] }),
		});
		expect(idx.getRelatedDecisions("S-001").map((e) => e.id).sort()).toEqual(["DEC-001", "DEC-002"]);
		expect(idx.getEnabledEntities("DEC-002").map((e) => e.id)).toEqual(["S-001"]);
	});
});
