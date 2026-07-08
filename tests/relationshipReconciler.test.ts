// relationshipReconciler.ts imports { App, TFile, Notice } from "obsidian".
// App/TFile are types (elided), but Notice is used as a runtime value, so we
// provide a virtual mock of the obsidian module.
jest.mock(
	"obsidian",
	() => ({
		Notice: class Notice {
			message: string;
			constructor(message: string) {
				this.message = message;
			}
		},
	}),
	{ virtual: true }
);

import {
	reconcileRelationships,
	cleanTransitiveDependencies,
	detectAndBreakCycles,
	sanitizeEntityFilesForYaml,
} from "../util/relationshipReconciler";
import { parseRawFrontmatter } from "../util/frontmatter";

// ---------------------------------------------------------------------------
// In-memory vault harness.  Each entity is a frontmatter object stored by path.
//   - vault.read serializes the object back to markdown
//   - fileManager.processFrontMatter mutates the stored object in place
// ---------------------------------------------------------------------------
type FM = Record<string, unknown>;

function serialize(fm: FM): string {
	const lines = ["---"];
	for (const [k, v] of Object.entries(fm)) {
		if (v === undefined || v === null) continue;
		if (Array.isArray(v)) lines.push(`${k}: ${JSON.stringify(v)}`);
		else lines.push(`${k}: ${v}`);
	}
	lines.push("---");
	return lines.join("\n") + "\n";
}

function makeVault(entities: FM[]) {
	const store = new Map<string, FM>();
	const files: any[] = [];
	for (const fm of entities) {
		const path = `${fm.id}.md`;
		store.set(path, fm);
		files.push({ path, basename: String(fm.id) });
	}
	const app = {
		vault: {
			read: async (file: any) => serialize(store.get(file.path) as FM),
			// applyFrontmatterUpdates now does read → merge → modify; parse the
			// written content back into the store so assertions on the object see it.
			modify: async (file: any, content: string) => {
				const fm = parseRawFrontmatter(content);
				if (fm) store.set(file.path, fm as FM);
			},
		},
		fileManager: {
			processFrontMatter: async (file: any, fn: (fm: FM) => void) => {
				fn(store.get(file.path) as FM);
			},
		},
	} as any;
	return { app, files, store };
}

// silence the modules' heavy console logging
beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation(() => {});
	jest.spyOn(console, "warn").mockImplementation(() => {});
	jest.spyOn(console, "debug").mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe("reconcileRelationships", () => {
	it("adds implemented_by when a milestone implements a feature", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", type: "milestone", title: "M", implements: ["F-001"] },
			{ id: "F-001", type: "feature", title: "F" },
		]);
		const res = await reconcileRelationships(app, files);
		expect(store.get("F-001.md")!.implemented_by).toEqual(["M-001"]);
		expect(res.totalReconciled).toBeGreaterThanOrEqual(1);
	});

	it("syncs depends_on -> blocks (and back)", async () => {
		const { app, files, store } = makeVault([
			{ id: "S-001", type: "story", title: "A", depends_on: ["S-002"] },
			{ id: "S-002", type: "story", title: "B" },
		]);
		await reconcileRelationships(app, files);
		expect(store.get("S-002.md")!.blocks).toEqual(["S-001"]);
	});

	it("syncs parent -> children (array) ", async () => {
		const { app, files, store } = makeVault([
			{ id: "S-001", type: "story", title: "child", parent: "M-001" },
			{ id: "M-001", type: "milestone", title: "parent" },
		]);
		await reconcileRelationships(app, files);
		expect(store.get("M-001.md")!.children).toEqual(["S-001"]);
	});

	it("syncs children -> parent as a scalar", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", type: "milestone", title: "parent", children: ["S-001"] },
			{ id: "S-001", type: "story", title: "child" },
		]);
		await reconcileRelationships(app, files);
		// parent is a SCALAR field: written as a string, not an array
		expect(store.get("S-001.md")!.parent).toBe("M-001");
	});

	it("does NOT carry the deprecated enables/enabled_by pair", async () => {
		// `enables`/`enabled_by` is not in the schema; the reconciler no longer
		// syncs it (it is not a source-of-truth relationship).
		const { app, files, store } = makeVault([
			{ id: "DEC-001", type: "decision", title: "D", enables: ["S-001"] },
			{ id: "S-001", type: "story", title: "S" },
		]);
		await reconcileRelationships(app, files);
		expect(store.get("S-001.md")!.enabled_by).toBeUndefined();
	});

	it("syncs affects -> decided_by (decision impacts a document)", async () => {
		const { app, files, store } = makeVault([
			{ id: "DEC-001", type: "decision", title: "D", affects: ["DOC-001"] },
			{ id: "DOC-001", type: "document", title: "Doc" },
		]);
		await reconcileRelationships(app, files);
		expect(store.get("DOC-001.md")!.decided_by).toEqual(["DEC-001"]);
	});

	it("syncs documents -> documented_by (document documents a feature)", async () => {
		const { app, files, store } = makeVault([
			{ id: "DOC-001", type: "document", title: "Doc", documents: ["F-001"] },
			{ id: "F-001", type: "feature", title: "F" },
		]);
		await reconcileRelationships(app, files);
		expect(store.get("F-001.md")!.documented_by).toEqual(["DOC-001"]);
	});

	it("syncs supersedes -> superseded_by as a scalar", async () => {
		const { app, files, store } = makeVault([
			{ id: "DEC-002", type: "decision", title: "new", supersedes: ["DEC-001"] },
			{ id: "DEC-001", type: "decision", title: "old" },
		]);
		await reconcileRelationships(app, files);
		// superseded_by is 'one' cardinality → written as a string, not an array
		expect(store.get("DEC-001.md")!.superseded_by).toBe("DEC-002");
	});

	it("syncs previous_version -> next_version as a scalar", async () => {
		const { app, files, store } = makeVault([
			{ id: "DOC-002", type: "document", title: "v2", previous_version: ["DOC-001"] },
			{ id: "DOC-001", type: "document", title: "v1" },
		]);
		await reconcileRelationships(app, files);
		// next_version is 'one' cardinality → written as a string, not an array
		expect(store.get("DOC-001.md")!.next_version).toBe("DOC-002");
	});

	it("ignores dangling targets not present in the vault", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", type: "milestone", title: "M", implements: ["F-999"] },
		]);
		const res = await reconcileRelationships(app, files);
		expect(res.totalReconciled).toBe(0);
		expect(store.get("M-001.md")!.implements).toEqual(["F-999"]);
	});

	it("does not duplicate an already-consistent inverse", async () => {
		const { app, files, store } = makeVault([
			{ id: "S-001", type: "story", title: "A", depends_on: ["S-002"] },
			{ id: "S-002", type: "story", title: "B", blocks: ["S-001"] },
		]);
		const res = await reconcileRelationships(app, files);
		expect(res.totalReconciled).toBe(0);
		expect(store.get("S-002.md")!.blocks).toEqual(["S-001"]);
	});

	it("reconciles the reverse side too (documented_by -> documents)", async () => {
		// The pair table carries both directions, derived from the schema, so a
		// feature that already declares documented_by gets `documents` written back.
		const { app, files, store } = makeVault([
			{ id: "F-001", type: "feature", title: "F", documented_by: ["DOC-001"] },
			{ id: "DOC-001", type: "document", title: "Doc" },
		]);
		await reconcileRelationships(app, files);
		expect(store.get("DOC-001.md")!.documents).toEqual(["F-001"]);
	});
});

describe("cleanTransitiveDependencies", () => {
	it("removes a transitively-implied depends_on and cleans the reverse blocks", async () => {
		const { app, files, store } = makeVault([
			{ id: "T-001", type: "task", title: "A", depends_on: [], blocks: ["T-003"] },
			{ id: "T-002", type: "task", title: "B", depends_on: ["T-001"] },
			{ id: "T-003", type: "task", title: "C", depends_on: ["T-001", "T-002"] },
		]);
		const res = await cleanTransitiveDependencies(app, files);
		// T-001 is redundant in T-003.depends_on because T-002 depends on T-001
		expect(store.get("T-003.md")!.depends_on).toEqual(["T-002"]);
		// reverse cleanup: T-003 removed from T-001.blocks
		expect(store.get("T-001.md")!.blocks).toEqual([]);
		expect(res.totalCleaned).toBe(1);
	});

	it("cleans a transitively-implied implemented_by and its reverse implements", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", type: "milestone", title: "M1", depends_on: [], implements: ["F-001"] },
			{ id: "M-002", type: "milestone", title: "M2", depends_on: ["M-001"] },
			{
				id: "F-001",
				type: "feature",
				title: "F",
				implemented_by: ["M-001", "M-002"],
			},
		]);
		await cleanTransitiveDependencies(app, files);
		expect(store.get("F-001.md")!.implemented_by).toEqual(["M-002"]);
		expect(store.get("M-001.md")!.implements).toEqual([]);
	});

	it("does nothing when there is nothing transitive to remove", async () => {
		const { app, files, store } = makeVault([
			{ id: "T-001", type: "task", title: "A", depends_on: ["T-002", "T-003"] },
			{ id: "T-002", type: "task", title: "B", depends_on: [] },
			{ id: "T-003", type: "task", title: "C", depends_on: [] },
		]);
		const res = await cleanTransitiveDependencies(app, files);
		expect(res.totalCleaned).toBe(0);
		expect(store.get("T-001.md")!.depends_on).toEqual(["T-002", "T-003"]);
	});
});

describe("detectAndBreakCycles", () => {
	it("detects and breaks a 3-node blocks cycle", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", type: "milestone", title: "M1", blocks: ["M-002"] },
			{ id: "M-002", type: "milestone", title: "M2", blocks: ["M-003"] },
			{ id: "M-003", type: "milestone", title: "M3", blocks: ["M-001"] },
		]);
		const res = await detectAndBreakCycles(app, files, "milestone");
		expect(res.cyclesFound).toBe(1);
		expect(res.edgesRemoved.length).toBe(1);
		// exactly one milestone lost a blocks entry
		const totalBlocks =
			(store.get("M-001.md")!.blocks as string[]).length +
			(store.get("M-002.md")!.blocks as string[]).length +
			(store.get("M-003.md")!.blocks as string[]).length;
		expect(totalBlocks).toBe(2);
	});

	it("returns zero cycles for an acyclic graph", async () => {
		const { app, files } = makeVault([
			{ id: "M-001", type: "milestone", title: "M1", blocks: ["M-002"] },
			{ id: "M-002", type: "milestone", title: "M2" },
		]);
		const res = await detectAndBreakCycles(app, files, "milestone");
		expect(res.cyclesFound).toBe(0);
		expect(res.edgesRemoved).toEqual([]);
	});

	it("breaks a depends_on cycle too", async () => {
		const { app, files } = makeVault([
			{ id: "M-001", type: "milestone", title: "M1", depends_on: ["M-002"] },
			{ id: "M-002", type: "milestone", title: "M2", depends_on: ["M-001"] },
			{ id: "M-003", type: "milestone", title: "M3", depends_on: ["M-001"], blocks: ["M-002"] },
		]);
		const res = await detectAndBreakCycles(app, files);
		// M-001 <-> M-002 is a 2-cycle
		expect(res.cyclesFound).toBeGreaterThanOrEqual(1);
	});

	it("filters out entities of the wrong type", async () => {
		const { app, files } = makeVault([
			{ id: "T-001", type: "task", title: "A", blocks: ["T-002"] },
			{ id: "T-002", type: "task", title: "B", blocks: ["T-001"] },
		]);
		const res = await detectAndBreakCycles(app, files, "milestone");
		expect(res.cyclesFound).toBe(0);
	});
});

describe("canonical entity parsing (Phase 4)", () => {
	it("reconciles entities that have no title (EntityParser defaults it; the legacy parser skipped them)", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", type: "milestone", implements: ["F-001"] },
			{ id: "F-001", type: "feature", title: "F" },
		]);
		const res = await reconcileRelationships(app, files);
		expect(res.totalReconciled).toBe(1);
		expect(store.get("F-001.md")!.implemented_by).toEqual(["M-001"]);
	});

	it("excludes strict-YAML-invalid files from the reconcile map (repair belongs to sanitizeEntityFilesForYaml)", async () => {
		const { app, files, store } = makeVault([
			// unquoted colon in the title → YAML.parse throws → canonical parse null
			{ id: "M-001", type: "milestone", title: "Bad: colon", implements: ["F-001"] },
			{ id: "F-001", type: "feature", title: "F" },
		]);
		const res = await reconcileRelationships(app, files);
		expect(res.totalReconciled).toBe(0);
		expect(store.get("F-001.md")!.implemented_by).toBeUndefined();
	});

	it("excludes files missing id or type from the reconcile map", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", title: "no type", implements: ["F-001"] },
			{ id: "F-001", type: "feature", title: "F" },
		]);
		const res = await reconcileRelationships(app, files);
		expect(res.totalReconciled).toBe(0);
		expect(store.get("F-001.md")!.implemented_by).toBeUndefined();
	});
});

describe("sanitizeEntityFilesForYaml", () => {
	it("sanitizes unsafe colon characters in string fields", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", type: "milestone", title: "Phase 1: Setup", goal: "safe goal" },
		]);
		const res = await sanitizeEntityFilesForYaml(app, files);
		expect(res.totalSanitized).toBe(1);
		expect(store.get("M-001.md")!.title).toBe("Phase 1 - Setup");
		expect(res.details[0]).toMatchObject({ field: "title" });
	});

	it("leaves already-safe files untouched", async () => {
		const { app, files, store } = makeVault([
			{ id: "M-001", type: "milestone", title: "All Clear" },
		]);
		const res = await sanitizeEntityFilesForYaml(app, files);
		expect(res.totalSanitized).toBe(0);
		expect(store.get("M-001.md")!.title).toBe("All Clear");
	});
});
