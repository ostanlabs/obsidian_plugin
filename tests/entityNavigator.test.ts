import {
	getEntityTypeFromId,
	isEntityId,
	EntityIndex,
	ID_PATTERNS,
} from "../util/entityNavigator";

// ---------------------------------------------------------------------------
// Light Obsidian fake: only the surface EntityIndex touches
//   app.vault.getMarkdownFiles() and app.metadataCache.getFileCache(file)
// ---------------------------------------------------------------------------
interface FakeEntity {
	path?: string; // defaults to `${id}.md`
	basename?: string;
	frontmatter: Record<string, unknown> | null;
}

function makeApp(entities: FakeEntity[]) {
	const files = entities.map((e) => {
		const path = e.path ?? `${(e.frontmatter as any)?.id ?? "note"}.md`;
		const basename = e.basename ?? path.replace(/\.md$/, "");
		return { file: { path, basename }, frontmatter: e.frontmatter };
	});
	const cacheByPath = new Map<string, unknown>();
	for (const f of files) {
		cacheByPath.set(
			f.file.path,
			f.frontmatter ? { frontmatter: f.frontmatter } : {}
		);
	}
	const app = {
		vault: { getMarkdownFiles: () => files.map((f) => f.file) },
		metadataCache: {
			getFileCache: (file: any) => cacheByPath.get(file.path),
		},
	} as any;
	return { app, files };
}

const settings = {} as any;

async function buildIndex(entities: FakeEntity[]) {
	const { app } = makeApp(entities);
	const idx = new EntityIndex(app, settings);
	await idx.buildIndex();
	return idx;
}

describe("entityNavigator - id helpers", () => {
	it("maps id prefixes to entity types", () => {
		expect(getEntityTypeFromId("M-001")).toBe("milestone");
		expect(getEntityTypeFromId("S-001")).toBe("story");
		expect(getEntityTypeFromId("T-001")).toBe("task");
		expect(getEntityTypeFromId("DEC-001")).toBe("decision");
		expect(getEntityTypeFromId("DOC-001")).toBe("document");
		expect(getEntityTypeFromId("F-001")).toBe("feature");
	});
	it("returns null for unknown ids", () => {
		expect(getEntityTypeFromId("X-1")).toBeNull();
		expect(getEntityTypeFromId("M-1")).toBeNull(); // needs 3+ digits
	});
	it("isEntityId reflects getEntityTypeFromId", () => {
		expect(isEntityId("F-123")).toBe(true);
		expect(isEntityId("nope")).toBe(false);
	});
	it("exposes ID_PATTERNS", () => {
		expect(ID_PATTERNS.milestone.test("M-999")).toBe(true);
	});
});

describe("entityNavigator - buildIndex / lookups", () => {
	it("indexes entities and skips non-entities", async () => {
		const idx = await buildIndex([
			{ frontmatter: { id: "M-001", type: "milestone", title: "Root" } },
			{ frontmatter: null }, // no cache -> skipped
			{ frontmatter: { title: "no id and non-entity basename" }, path: "misc.md" },
		]);
		expect(idx.isReady()).toBe(true);
		expect(idx.getAll().length).toBe(1);
		expect(idx.get("M-001")?.title).toBe("Root");
		expect(idx.getFile("M-001")?.path).toBe("M-001.md");
		expect(idx.get("missing")).toBeUndefined();
	});

	it("derives id from basename when frontmatter has none", async () => {
		const idx = await buildIndex([
			{
				frontmatter: { type: "task", title: "From Name" },
				path: "T-042 Something.md",
				basename: "T-042 Something",
			},
		]);
		expect(idx.get("T-042")?.title).toBe("From Name");
	});

	it("normalizes single-string relationship fields into arrays", async () => {
		const idx = await buildIndex([
			{ frontmatter: { id: "S-001", type: "story", title: "S", depends_on: "M-001" } },
		]);
		expect(idx.get("S-001")?.depends_on).toEqual(["M-001"]);
	});

	it("getByType filters by type", async () => {
		const idx = await buildIndex([
			{ frontmatter: { id: "M-001", type: "milestone", title: "M" } },
			{ frontmatter: { id: "S-001", type: "story", title: "S" } },
			{ frontmatter: { id: "S-002", type: "story", title: "S2" } },
		]);
		expect(idx.getByType("story").map((e) => e.id).sort()).toEqual([
			"S-001",
			"S-002",
		]);
	});
});

describe("entityNavigator - parent/child/deps navigation", () => {
	async function fixture() {
		return buildIndex([
			{ frontmatter: { id: "M-001", type: "milestone", title: "M" } },
			{ frontmatter: { id: "S-001", type: "story", title: "S1", parent: "M-001" } },
			{
				frontmatter: {
					id: "S-002",
					type: "story",
					title: "S2",
					parent: "M-001",
					depends_on: ["S-001"],
				},
			},
		]);
	}

	it("getParent / getChildren", async () => {
		const idx = await fixture();
		expect(idx.getParent("S-001")?.id).toBe("M-001");
		expect(idx.getParent("M-001")).toBeUndefined();
		expect(idx.getChildren("M-001").map((e) => e.id).sort()).toEqual([
			"S-001",
			"S-002",
		]);
	});

	it("getDependencies / getDependents", async () => {
		const idx = await fixture();
		expect(idx.getDependencies("S-002").map((e) => e.id)).toEqual(["S-001"]);
		expect(idx.getDependencies("missing")).toEqual([]);
		expect(idx.getDependents("S-001").map((e) => e.id)).toEqual(["S-002"]);
	});

	it("getFromFile finds the entry by path", async () => {
		const idx = await fixture();
		const entry = idx.getFromFile({ path: "S-001.md" } as any);
		expect(entry?.id).toBe("S-001");
		expect(idx.getFromFile({ path: "nope.md" } as any)).toBeUndefined();
	});
});

describe("entityNavigator - implements / decisions", () => {
	it("getImplementedDocuments and getImplementors (both directions)", async () => {
		const idx = await buildIndex([
			{ frontmatter: { id: "F-001", type: "feature", title: "Feat", implemented_by: ["M-002"] } },
			{ frontmatter: { id: "M-001", type: "milestone", title: "M1", implements: ["F-001"] } },
			{ frontmatter: { id: "M-002", type: "milestone", title: "M2" } },
		]);
		expect(idx.getImplementedDocuments("M-001").map((e) => e.id)).toEqual([
			"F-001",
		]);
		// implementors come from both e.implements and feature.implemented_by, deduped
		expect(idx.getImplementors("F-001").map((e) => e.id).sort()).toEqual([
			"M-001",
			"M-002",
		]);
		expect(idx.getImplementors("missing")).toEqual([]);
	});

	it("getRelatedDecisions via depends_on and enables", async () => {
		const idx = await buildIndex([
			{
				frontmatter: {
					id: "S-001",
					type: "story",
					title: "S",
					depends_on: ["DEC-001"],
				},
			},
			{ frontmatter: { id: "DEC-001", type: "decision", title: "D1" } },
			{
				frontmatter: {
					id: "DEC-002",
					type: "decision",
					title: "D2",
					enables: ["S-001"],
				},
			},
		]);
		expect(idx.getRelatedDecisions("S-001").map((e) => e.id).sort()).toEqual([
			"DEC-001",
			"DEC-002",
		]);
		expect(idx.getEnabledEntities("DEC-002").map((e) => e.id)).toEqual([
			"S-001",
		]);
		expect(idx.getRelatedDecisions("missing")).toEqual([]);
	});
});

describe("entityNavigator - feature navigation", () => {
	async function fixture() {
		return buildIndex([
			{
				frontmatter: {
					id: "F-001",
					type: "feature",
					title: "Feat",
					tier: "OSS",
					phase: "MVP",
					implemented_by: ["M-001"],
					documented_by: ["DOC-001"],
					decided_by: ["DEC-001"],
					blocks: ["F-002"],
				},
			},
			{
				frontmatter: {
					id: "F-002",
					type: "feature",
					title: "Feat2",
					tier: "Premium",
					phase: "1",
					depends_on: ["F-001"],
				},
			},
			{ frontmatter: { id: "M-001", type: "milestone", title: "M" } },
			{ frontmatter: { id: "DOC-001", type: "document", title: "Doc" } },
			{ frontmatter: { id: "DEC-001", type: "decision", title: "Dec" } },
		]);
	}

	it("getFeaturesImplementedBy / getFeatureImplementors", async () => {
		const idx = await fixture();
		expect(idx.getFeaturesImplementedBy("M-001").map((e) => e.id)).toEqual([
			"F-001",
		]);
		expect(idx.getFeatureImplementors("F-001").map((e) => e.id)).toEqual([
			"M-001",
		]);
		// non-feature id returns empty
		expect(idx.getFeatureImplementors("M-001")).toEqual([]);
	});

	it("getFeatureDocuments / getFeatureDecisions", async () => {
		const idx = await fixture();
		expect(idx.getFeatureDocuments("F-001").map((e) => e.id)).toEqual([
			"DOC-001",
		]);
		expect(idx.getFeatureDecisions("F-001").map((e) => e.id)).toEqual([
			"DEC-001",
		]);
		expect(idx.getFeatureDocuments("missing")).toEqual([]);
	});

	it("getFeatureDependents / getBlockedFeatures", async () => {
		const idx = await fixture();
		expect(idx.getFeatureDependents("F-001").map((e) => e.id)).toEqual([
			"F-002",
		]);
		expect(idx.getBlockedFeatures("F-001").map((e) => e.id)).toEqual(["F-002"]);
		expect(idx.getBlockedFeatures("F-002")).toEqual([]);
	});

	it("getFeaturesByTier / getFeaturesByPhase", async () => {
		const idx = await fixture();
		expect(idx.getFeaturesByTier("OSS").map((e) => e.id)).toEqual(["F-001"]);
		expect(idx.getFeaturesByPhase("1").map((e) => e.id)).toEqual(["F-002"]);
	});
});

describe("entityNavigator - incremental updates", () => {
	it("updateFile replaces an existing entry", async () => {
		const { app, files } = makeApp([
			{ frontmatter: { id: "T-001", type: "task", title: "Old" } },
		]);
		const idx = new EntityIndex(app, settings);
		await idx.buildIndex();
		// mutate the cache then update
		(app.metadataCache.getFileCache(files[0].file) as any).frontmatter.title =
			"New";
		await idx.updateFile(files[0].file);
		expect(idx.get("T-001")?.title).toBe("New");
	});

	it("removeFile drops an entry", async () => {
		const { app, files } = makeApp([
			{ frontmatter: { id: "T-001", type: "task", title: "X" } },
		]);
		const idx = new EntityIndex(app, settings);
		await idx.buildIndex();
		idx.removeFile(files[0].file);
		expect(idx.get("T-001")).toBeUndefined();
	});
});
