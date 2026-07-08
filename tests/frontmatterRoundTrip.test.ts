/**
 * Round-trip corpus for the canonical (EntitySerializer-format) frontmatter
 * writer. For a representative entity of every type — including relationship
 * arrays, plugin-only fields, and special characters (colons, quotes, hashes) —
 * we assert:
 *
 *   1. write → read-back yields identical logical data (no loss, no mangling);
 *   2. the on-disk output uses the canonical format
 *      (quote-when-needed scalars + YAML block-sequence arrays);
 *   3. the markdown body survives every write path verbatim;
 *   4. plugin-only fields (inProgress, created_by_plugin, notion_page_id, and
 *      arbitrary passthrough keys) round-trip.
 *
 * This is the guard that the plugin's writer stays byte-compatible with MCP's
 * entity-core EntitySerializer.
 */
import {
	updateFrontmatter,
	createWithFrontmatter,
	parseRawFrontmatter,
	applyFrontmatterUpdates,
} from "../util/frontmatter";

type FM = Record<string, unknown>;

/** Minimal in-memory Obsidian app exposing just vault.read / vault.modify. */
function makeApp(initial: string) {
	let content = initial;
	const app = {
		vault: {
			read: async () => content,
			modify: async (_file: unknown, next: string) => {
				content = next;
			},
		},
	} as any;
	const file = { path: "e.md", basename: "e" } as any;
	return { app, file, get: () => content };
}

const BODY = "\n# Heading\n\nSome body text with a : colon and #hash.\n";

/**
 * One representative entity per type. Each carries relationship arrays,
 * plugin-only fields, and special characters so the corpus exercises the
 * quoting + block-array format broadly.
 */
const CORPUS: Array<{ name: string; fm: FM; arrayFields: string[] }> = [
	{
		name: "task",
		arrayFields: ["depends_on", "blocks"],
		fm: {
			type: "task",
			id: "T-001",
			title: "Component 3: Config Loader",
			workstream: "engineering",
			status: "In Progress",
			priority: "High",
			inProgress: true,
			created_by_plugin: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-02T00:00:00.000Z",
			canvas_source: "board.canvas",
			vault_path: "tasks/T-001.md",
			notion_page_id: "abc-123",
			depends_on: ["T-002", "S-1"],
			blocks: ["T-009"],
		},
	},
	{
		name: "story",
		arrayFields: ["depends_on", "implements"],
		fm: {
			type: "story",
			id: "S-010",
			title: 'Quote "test" in the title',
			workstream: "default",
			status: "Not Started",
			priority: "Medium",
			inProgress: false,
			created_by_plugin: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
			canvas_source: "board.canvas",
			vault_path: "stories/S-010.md",
			depends_on: [],
			implements: ["F-001"],
		},
	},
	{
		name: "milestone",
		arrayFields: ["depends_on", "implements"],
		fm: {
			type: "milestone",
			id: "M-002",
			title: "Ship MVP # 1",
			workstream: "engineering",
			status: "Not Started",
			priority: "Critical",
			created_by_plugin: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
			canvas_source: "board.canvas",
			vault_path: "milestones/M-002.md",
			depends_on: ["M-001"],
			implements: ["F-001", "F-002"],
		},
	},
	{
		name: "decision",
		arrayFields: ["affects"],
		fm: {
			type: "decision",
			id: "DEC-003",
			title: "Adopt EntitySerializer: rationale",
			workstream: "architecture",
			status: "Accepted",
			priority: "High",
			created_by_plugin: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
			canvas_source: "board.canvas",
			vault_path: "decisions/DEC-003.md",
			affects: ["F-001", "DOC-002", "S-010"],
		},
	},
	{
		name: "document",
		arrayFields: ["documents"],
		fm: {
			type: "document",
			id: "DOC-002",
			title: "Design: Unification Spec",
			workstream: "docs",
			status: "Draft",
			priority: "Low",
			created_by_plugin: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
			canvas_source: "board.canvas",
			vault_path: "docs/DOC-002.md",
			documents: ["F-001"],
		},
	},
	{
		name: "feature",
		arrayFields: ["implemented_by", "documented_by", "decided_by", "depends_on", "blocks", "personas", "acceptance_criteria", "test_refs"],
		fm: {
			type: "feature",
			id: "F-001",
			title: "Configurable Schema: multi-type",
			workstream: "engineering",
			user_story: "As a user, I want X, so that Y: done.",
			tier: "Premium",
			phase: "1",
			status: "In Progress",
			priority: "High",
			created_by_plugin: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:00.000Z",
			personas: ["admin", "power-user"],
			acceptance_criteria: ["Given: a vault", "When: reformatted"],
			test_refs: ["tests/frontmatter.test.ts"],
			implemented_by: ["M-002", "S-010"],
			documented_by: ["DOC-002"],
			decided_by: ["DEC-003"],
			depends_on: [],
			blocks: ["F-002"],
		},
	},
];

/** Compare two frontmatter objects on the given keys, treating arrays by value. */
function expectLogicalEqual(actual: FM | null, expected: FM) {
	expect(actual).not.toBeNull();
	for (const [key, value] of Object.entries(expected)) {
		if (Array.isArray(value)) {
			expect(actual![key] ?? []).toEqual(value);
		} else {
			expect(actual![key]).toEqual(value);
		}
	}
}

describe("frontmatter round-trip corpus (canonical EntitySerializer format)", () => {
	for (const entry of CORPUS) {
		describe(entry.name, () => {
			it("round-trips via createWithFrontmatter → parseRawFrontmatter", () => {
				const content = createWithFrontmatter(BODY, entry.fm as any);

				// Body preserved verbatim.
				expect(content.endsWith(BODY)).toBe(true);

				// Canonical format: quote-when-needed (these values are plain).
				expect(content).toContain(`type: ${entry.fm.type}`);
				expect(content).toContain(`id: ${entry.fm.id}`);

				// Non-empty relationship arrays render as block sequences
				// (plain items unless a value needs quoting).
				for (const field of entry.arrayFields) {
					const arr = entry.fm[field] as unknown[] | undefined;
					if (arr && arr.length > 0) {
						expect(content).toMatch(new RegExp(`${field}:\\n\\s*-\\s*\\S`));
						// Never inline-JSON.
						expect(content).not.toContain(`${field}: ["`);
					}
				}

				const parsed = parseRawFrontmatter(content);
				expectLogicalEqual(parsed, entry.fm);
			});

			it("round-trips via updateFrontmatter (merge) → parseRawFrontmatter", () => {
				// Start from a bare doc and merge the whole entity in.
				const base = `---\ntype: "${entry.fm.type}"\nid: "${entry.fm.id}"\n---\n${BODY}`;
				const content = updateFrontmatter(base, entry.fm as any);

				expect(content.endsWith(BODY)).toBe(true);
				const parsed = parseRawFrontmatter(content);
				expectLogicalEqual(parsed, entry.fm);
			});

			it("round-trips via applyFrontmatterUpdates (read-modify-write) preserving body + plugin-only fields", async () => {
				// Seed a file that already holds plugin-only fields, then patch a field.
				const seed =
					`---\ntype: "${entry.fm.type}"\nid: "${entry.fm.id}"\n` +
					`inProgress: true\ncreated_by_plugin: true\nnotion_page_id: "seed-xyz"\ncustom_plugin_field: "keep-me"\n` +
					`---\n${BODY}`;
				const { app, file, get } = makeApp(seed);

				await applyFrontmatterUpdates(app, file, {
					title: entry.fm.title,
					depends_on: entry.fm.depends_on ?? [],
				});

				const out = get();
				// Body preserved.
				expect(out.endsWith(BODY)).toBe(true);
				const parsed = parseRawFrontmatter(out)!;
				// Plugin-only + passthrough fields survived the write untouched.
				expect(parsed.inProgress).toBe(true);
				expect(parsed.created_by_plugin).toBe(true);
				expect(parsed.notion_page_id).toBe("seed-xyz");
				expect(parsed.custom_plugin_field).toBe("keep-me");
				// The patched field landed.
				expect(parsed.title).toEqual(entry.fm.title);
			});
		});
	}

	it("deletes a field when applyFrontmatterUpdates is given an empty value", async () => {
		const seed = `---\ntype: "task"\nid: "T-1"\nnotion_page_id: "gone"\n---\nbody`;
		const { app, file, get } = makeApp(seed);
		await applyFrontmatterUpdates(app, file, { notion_page_id: "" });
		expect(get()).not.toContain("notion_page_id");
		expect(get()).toContain("body");
	});
});
