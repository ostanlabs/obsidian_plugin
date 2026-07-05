import {
	parseRawFrontmatter,
	parseFrontmatter,
	parseAnyFrontmatter,
	parseFrontmatterAndBody,
	updateFrontmatter,
	createWithFrontmatter,
	serializeFrontmatter,
	applyFrontmatterUpdates,
} from "../util/frontmatter";
import { ItemFrontmatter } from "../types";

describe("frontmatter - parseRawFrontmatter", () => {
	it("returns null when there is no frontmatter block", () => {
		expect(parseRawFrontmatter("no frontmatter here")).toBeNull();
	});

	it("parses JSON arrays", () => {
		const fm = parseRawFrontmatter(`---\ndepends_on: ["T-1", "T-2"]\n---`);
		expect(fm?.depends_on).toEqual(["T-1", "T-2"]);
	});

	it("parses YAML-style unquoted arrays", () => {
		const fm = parseRawFrontmatter(`---\nblocks: [T-1, T-2]\n---`);
		expect(fm?.blocks).toEqual(["T-1", "T-2"]);
	});

	it("parses an empty array literal", () => {
		const fm = parseRawFrontmatter(`---\ndepends_on: []\n---`);
		expect(fm?.depends_on).toEqual([]);
	});

	it("parses quoted strings, booleans and numbers", () => {
		const fm = parseRawFrontmatter(
			`---\ntitle: "Hello"\nname: 'World'\nflag: true\noff: false\nnum: 3.5\n---`
		);
		expect(fm?.title).toBe("Hello");
		expect(fm?.name).toBe("World");
		expect(fm?.flag).toBe(true);
		expect(fm?.off).toBe(false);
		expect(fm?.num).toBe(3.5);
	});

	it("coerces created_by_plugin string to boolean", () => {
		const fm = parseRawFrontmatter(
			`---\ncreated_by_plugin: "true"\ninProgress: "false"\n---`
		);
		expect(fm?.created_by_plugin).toBe(true);
		expect(fm?.inProgress).toBe(false);
	});

	it("normalizes a single string in an array field into an array", () => {
		const fm = parseRawFrontmatter(`---\ndepends_on: T-1\n---`);
		expect(fm?.depends_on).toEqual(["T-1"]);
	});

	it("skips lines with no colon", () => {
		const fm = parseRawFrontmatter(`---\njustaword\ntype: task\n---`);
		expect(fm?.type).toBe("task");
	});
});

describe("frontmatter - parseFrontmatter migrations", () => {
	it("migrates created/updated/effort to *_at/workstream", () => {
		const fm = parseFrontmatter(
			`---\ntype: task\ntitle: T\nid: T-1\ncreated: 2025-01-01\nupdated: 2025-01-02\neffort: Engineering\n---`
		);
		expect(fm?.created_at).toBe("2025-01-01");
		expect(fm?.updated_at).toBe("2025-01-02");
		expect(fm?.workstream).toBe("Engineering");
	});

	it("returns null when required fields are missing", () => {
		expect(parseFrontmatter(`---\ntype: task\ntitle: T\n---`)).toBeNull();
	});
});

describe("frontmatter - parseAnyFrontmatter", () => {
	it("returns null when required fields missing", () => {
		expect(parseAnyFrontmatter(`---\ntype: task\n---`)).toBeNull();
	});
	it("strips quotes from relationship ids", () => {
		const fm = parseAnyFrontmatter(
			`---\ntype: task\ntitle: T\nid: T-1\ndepends_on: ["\\"S-1\\""]\n---`
		);
		// JSON parse yields the literal quoted string, then sanitizeAllRelationships strips it
		expect(fm?.depends_on).toEqual(["S-1"]);
	});
});

describe("frontmatter - parseFrontmatterAndBody", () => {
	it("splits frontmatter and body", () => {
		const { frontmatter, body } = parseFrontmatterAndBody(
			`---\ntype: task\ntitle: T\n---\n# Heading\ntext`
		);
		expect(frontmatter.type).toBe("task");
		expect(body).toContain("# Heading");
	});

	it("returns whole content as body when no frontmatter", () => {
		const { frontmatter, body } = parseFrontmatterAndBody("just text");
		expect(frontmatter).toEqual({});
		expect(body).toBe("just text");
	});
});

describe("frontmatter - updateFrontmatter", () => {
	it("serializes arrays as JSON and quotes values with colons", () => {
		const out = updateFrontmatter(`---\ntype: task\n---\nbody`, {
			depends_on: ["A", "B"],
			title: "Has: colon",
		});
		expect(out).toContain('depends_on: ["A","B"]');
		expect(out).toContain('title: "Has: colon"');
	});

	it("prepends frontmatter when the source has none", () => {
		const out = updateFrontmatter("plain body", { title: "X" });
		expect(out).toContain("title: X");
		expect(out).toContain("plain body");
	});

	it("skips undefined and null values", () => {
		const out = updateFrontmatter(`---\ntype: task\n---`, {
			title: undefined as any,
			extra: null as any,
		});
		expect(out).not.toContain("extra");
	});
});

describe("frontmatter - createWithFrontmatter", () => {
	it("always includes present required fields even when empty", () => {
		const out = createWithFrontmatter("body", {
			type: "task",
			title: "T",
			depends_on: [],
			parent: "",
			notion_page_id: "",
		} as Partial<ItemFrontmatter>);
		expect(out).toContain("depends_on: []");
		// alwaysInclude fields present-but-empty are emitted with a bare key
		expect(out).toMatch(/parent:\s*$/m);
		expect(out).toMatch(/notion_page_id:\s*$/m);
	});

	it("emits alwaysInclude fields with their value when set", () => {
		const out = createWithFrontmatter("body", {
			type: "task",
			title: "T",
			parent: "M-001",
		} as Partial<ItemFrontmatter>);
		expect(out).toContain("parent: M-001");
	});

	it("quotes string values containing special chars", () => {
		const out = createWithFrontmatter("body", {
			type: "task",
			title: "A: B",
		} as Partial<ItemFrontmatter>);
		expect(out).toContain('title: "A: B"');
	});

	it("skips empty non-required fields", () => {
		const out = createWithFrontmatter("body", {
			type: "task",
			title: "",
		} as Partial<ItemFrontmatter>);
		expect(out).not.toMatch(/title:/);
	});
});

describe("frontmatter - serializeFrontmatter", () => {
	it("falls back to effort/created when new fields absent", () => {
		const out = serializeFrontmatter({
			type: "task",
			title: "T",
			id: "T-1",
			effort: "Infra",
			status: "Not Started",
			priority: "Low",
			created: "2025-01-01",
			updated: "2025-01-02",
			canvas_source: "c.canvas",
			vault_path: "t.md",
		} as unknown as ItemFrontmatter);
		expect(out).toContain("workstream: Infra");
		expect(out).toContain("created_at: 2025-01-01");
		expect(out).toContain("depends_on: []");
		expect(out).toContain("notion_page_id:");
	});

	it("emits notion_page_id when present", () => {
		const out = serializeFrontmatter({
			type: "task",
			title: "T",
			id: "T-1",
			workstream: "eng",
			status: "Done",
			priority: "High",
			created_at: "x",
			updated_at: "y",
			canvas_source: "c",
			vault_path: "v",
			notion_page_id: "abc123",
			depends_on: ["S-1"],
		} as unknown as ItemFrontmatter);
		expect(out).toContain("notion_page_id: abc123");
		expect(out).toContain('depends_on: ["S-1"]');
	});
});

describe("frontmatter - applyFrontmatterUpdates", () => {
	function makeFile(path: string) {
		return { path, basename: path.replace(/\.md$/, "") } as any;
	}

	it("uses processFrontMatter to set and delete fields", async () => {
		const store: Record<string, unknown> = { title: "Old", stale: "x" };
		const app = {
			fileManager: {
				processFrontMatter: async (_file: any, fn: (fm: any) => void) => {
					fn(store);
				},
			},
		} as any;
		await applyFrontmatterUpdates(app, makeFile("t.md"), {
			title: "New",
			stale: "", // empty -> delete
		});
		expect(store.title).toBe("New");
		expect("stale" in store).toBe(false);
	});

	it("falls back to manual update when processFrontMatter throws", async () => {
		let written = "";
		const app = {
			fileManager: {
				processFrontMatter: async () => {
					throw new Error("YAML boom");
				},
			},
			vault: {
				read: async () => `---\ntype: task\ntitle: Old\n---\nbody`,
				modify: async (_file: any, content: string) => {
					written = content;
				},
			},
		} as any;
		await applyFrontmatterUpdates(app, makeFile("t.md"), { title: "New" });
		expect(written).toContain("title: New");
		expect(written).toContain("body");
	});
});
