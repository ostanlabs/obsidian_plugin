/**
 * Integration: the local→Notion sync flows against the in-memory obsidian mock, with a
 * stubbed notionClient. Covers the parseFrontmatter call sites in:
 *   - syncFileToNotion(): single-note sync incl. the legacy-field migration-on-read
 *     (created→created_at, effort→workstream) that the parser applies before the
 *     frontmatter is handed to notionClient.syncNote.
 *   - syncAllCanvasNotesToNotion(): canvas-wide two-pass sync (pages, then edge-derived
 *     dependencies) — pins that eligibility is `frontmatter.created_by_plugin`, NOT the
 *     broader isPluginCreatedNote() check.
 *   - initializeFileEntityIdCache(): vault scan feeding fileEntityIdCache.
 *   - pollNotionForChanges(): timestamp-gated Notion→local update routing.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Notice, TFile, Vault, Workspace } from "./harness/obsidian-mock";
import { parseFrontmatter } from "../util/frontmatter";

const MANIFEST = {
	id: "canvas-structured-items",
	name: "Canvas Structured Items",
	version: "0.0.0-test",
	minAppVersion: "1.0.0",
	author: "test",
	description: "test",
};

type NotionSettings = {
	notionEnabled: boolean;
	notionDatabaseId: string;
};

function makePlugin(seed: Record<string, string> = {}) {
	const app = createTestApp(seed);
	const plugin = new CanvasStructuredItemsPlugin(app as never, MANIFEST as never);
	return {
		plugin: plugin as unknown as Record<string, (...a: unknown[]) => Promise<unknown>> & {
			settings: NotionSettings;
			notionClient: unknown;
			fileEntityIdCache: Map<string, string>;
		},
		vault: app.vault as unknown as Vault,
		workspace: app.workspace as unknown as Workspace,
	};
}

function note(fields: Record<string, string>): string {
	// parseFrontmatter needs type+title+id; default a title.
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

beforeEach(() => {
	Notice.instances = [];
});

describe("syncFileToNotion (integration via obsidian mock)", () => {
	function enableNotion(plugin: { settings: NotionSettings }) {
		plugin.settings.notionEnabled = true;
		plugin.settings.notionDatabaseId = "db-1";
	}

	it("syncs a valid entity note and writes the returned notion_page_id back", async () => {
		const synced: Array<Record<string, unknown>> = [];
		const { plugin, vault } = makePlugin({
			"tasks/T-001.md": note({ type: "task", id: "T-001", status: "Not Started" }),
		});
		enableNotion(plugin);
		plugin.notionClient = {
			syncNote: async (fm: Record<string, unknown>) => {
				synced.push(fm);
				return "page-123";
			},
		};

		await plugin.syncFileToNotion(new TFile("tasks/T-001.md"));

		expect(synced).toHaveLength(1);
		expect(synced[0].id).toBe("T-001");
		const fm = parseFrontmatter(vault._files.get("tasks/T-001.md")!)!;
		expect(fm.notion_page_id).toBe("page-123");
		expect(Notice.instances).toContain("Successfully synced to Notion");
	});

	it("migrates legacy fields on read: effort→workstream and created→created_at reach syncNote", async () => {
		const synced: Array<Record<string, unknown>> = [];
		const { plugin } = makePlugin({
			"tasks/T-002.md": note({
				type: "task",
				id: "T-002",
				effort: "growth",
				created: "2020-06-01T00:00:00.000Z",
			}),
		});
		enableNotion(plugin);
		plugin.notionClient = {
			syncNote: async (fm: Record<string, unknown>) => {
				synced.push(fm);
				return "page-x";
			},
		};

		await plugin.syncFileToNotion(new TFile("tasks/T-002.md"));

		// parseFrontmatter's auto-migration (WI-1) is what syncNote sees
		expect(synced[0].workstream).toBe("growth");
		expect(synced[0].created_at).toBe("2020-06-01T00:00:00.000Z");
	});

	it("does not rewrite the file when notion_page_id already exists", async () => {
		const { plugin, vault } = makePlugin({
			"tasks/T-003.md": note({ type: "task", id: "T-003", notion_page_id: "page-old" }),
		});
		enableNotion(plugin);
		plugin.notionClient = { syncNote: async () => "page-new" };
		const before = vault._files.get("tasks/T-003.md");

		await plugin.syncFileToNotion(new TFile("tasks/T-003.md"));

		// synced, but updateNoteWithNotionId skipped -> file byte-identical
		expect(vault._files.get("tasks/T-003.md")).toBe(before);
	});

	it("rejects a note whose type is not in the syncable set (feature is NOT syncable)", async () => {
		const { plugin, vault } = makePlugin({
			"features/F-001.md": note({ type: "feature", id: "F-001" }),
		});
		enableNotion(plugin);
		let called = false;
		plugin.notionClient = { syncNote: async () => { called = true; return "p"; } };
		const before = vault._files.get("features/F-001.md");

		await plugin.syncFileToNotion(new TFile("features/F-001.md"));

		expect(called).toBe(false);
		expect(vault._files.get("features/F-001.md")).toBe(before);
		expect(Notice.instances).toContain("This note is not a valid entity type");
	});

	it("notices and returns for a note without valid frontmatter", async () => {
		const { plugin } = makePlugin({ "notes/plain.md": "no frontmatter" });
		enableNotion(plugin);
		plugin.notionClient = { syncNote: async () => "p" };

		await plugin.syncFileToNotion(new TFile("notes/plain.md"));

		expect(Notice.instances).toContain("This note does not have valid canvas item frontmatter");
	});

	it("refuses to sync when Notion is disabled (default settings)", async () => {
		const { plugin } = makePlugin({
			"tasks/T-004.md": note({ type: "task", id: "T-004" }),
		});
		// notionEnabled stays false; no client
		await plugin.syncFileToNotion(new TFile("tasks/T-004.md"));
		expect(Notice.instances).toContain("Notion sync is not enabled");
	});
});

describe("syncAllCanvasNotesToNotion (integration via obsidian mock)", () => {
	const CANVAS = "board.canvas";

	function canvas(files: string[], edges: Array<[number, number]> = []): string {
		return JSON.stringify({
			nodes: files.map((f, i) => ({ id: `n${i}`, type: "file", file: f, x: 0, y: 0, width: 100, height: 100 })),
			edges: edges.map(([from, to], i) => ({ id: `e${i}`, fromNode: `n${from}`, toNode: `n${to}` })),
		});
	}

	it("two-pass sync: pages first, then dependencies derived from canvas edges", async () => {
		const synced: string[] = [];
		const depUpdates: Array<{ page: string; deps: string[] }> = [];
		const { plugin, vault, workspace } = makePlugin({
			// Edge n0 -> n1 means B (n1) depends on A (n0)
			[CANVAS]: canvas(["A.md", "B.md"], [[0, 1]]),
			"A.md": note({ type: "task", id: "A-1", canvas_source: CANVAS, created_by_plugin: "true" }),
			"B.md": note({ type: "task", id: "B-1", canvas_source: CANVAS, created_by_plugin: "true" }),
		});
		plugin.settings.notionEnabled = true;
		plugin.notionClient = {
			isDatabaseInitialized: () => true,
			syncNote: async (fm: Record<string, unknown>) => {
				synced.push(fm.id as string);
				return `page-${fm.id}`;
			},
			updateDependencies: async (pageId: string, deps: string[]) => {
				depUpdates.push({ page: pageId, deps });
			},
		};
		workspace._activeFile = new TFile(CANVAS);

		await plugin.syncAllCanvasNotesToNotion();

		expect(synced.sort()).toEqual(["A-1", "B-1"]);
		// B depends on A: B's page gets A's page as dependency
		expect(depUpdates).toEqual([{ page: "page-B-1", deps: ["page-A-1"] }]);
		// both files received their page ids
		expect(parseFrontmatter(vault._files.get("A.md")!)!.notion_page_id).toBe("page-A-1");
		expect(parseFrontmatter(vault._files.get("B.md")!)!.notion_page_id).toBe("page-B-1");
		expect(Notice.instances.join("\n")).toContain("2 pages synced");
	});

	it("skips notes without created_by_plugin even when they look plugin-created (canvas_source present)", async () => {
		const synced: string[] = [];
		const { plugin, workspace } = makePlugin({
			[CANVAS]: canvas(["A.md", "B.md"]),
			// has canvas_source (isPluginCreatedNote would accept it) but NOT created_by_plugin
			"A.md": note({ type: "task", id: "A-1", canvas_source: CANVAS }),
			"B.md": note({ type: "task", id: "B-1", canvas_source: CANVAS, created_by_plugin: "true" }),
		});
		plugin.settings.notionEnabled = true;
		plugin.notionClient = {
			isDatabaseInitialized: () => true,
			syncNote: async (fm: Record<string, unknown>) => {
				synced.push(fm.id as string);
				return `page-${fm.id}`;
			},
			updateDependencies: async () => undefined,
		};
		workspace._activeFile = new TFile(CANVAS);

		await plugin.syncAllCanvasNotesToNotion();

		// this flow gates on frontmatter.created_by_plugin, not isPluginCreatedNote()
		expect(synced).toEqual(["B-1"]);
		expect(Notice.instances.join("\n")).toContain("1 pages synced, 1 skipped");
	});

	it("notices when there is no active canvas file", async () => {
		const { plugin } = makePlugin();
		plugin.settings.notionEnabled = true;
		plugin.notionClient = { isDatabaseInitialized: () => true };
		// workspace._activeFile stays null

		await plugin.syncAllCanvasNotesToNotion();

		expect(Notice.instances).toContain("No active canvas file");
	});
});

describe("initializeFileEntityIdCache (integration via obsidian mock)", () => {
	it("caches only plugin-created notes (canvas_source) with ids, skipping the rest", async () => {
		const { plugin } = makePlugin({
			"tasks/T-001.md": note({ type: "task", id: "T-001", canvas_source: "b.canvas" }),
			"tasks/T-002.md": note({ type: "task", id: "T-002" }), // not plugin-created
			"notes/plain.md": "no frontmatter",
		});

		await plugin.initializeFileEntityIdCache();

		expect(plugin.fileEntityIdCache.get("tasks/T-001.md")).toBe("T-001");
		expect(plugin.fileEntityIdCache.has("tasks/T-002.md")).toBe(false);
		expect(plugin.fileEntityIdCache.has("notes/plain.md")).toBe(false);
		expect(plugin.fileEntityIdCache.size).toBe(1);
	});
});

describe("pollNotionForChanges (integration via obsidian mock)", () => {
	function page(entityId: string, lastEdited: string) {
		return {
			id: `pg-${entityId}`,
			properties: {
				ID: { rich_text: [{ plain_text: entityId }] },
				Title: { title: [{ plain_text: "From Notion" }] },
			},
			last_edited_time: lastEdited,
		};
	}

	it("pulls a newer Notion page into the local file", async () => {
		const { plugin, vault } = makePlugin({
			"tasks/T-001.md": note({
				type: "task",
				id: "T-001",
				canvas_source: "b.canvas",
				updated_at: "2024-01-01T00:00:00.000Z",
			}),
		});
		plugin.settings.notionEnabled = true;
		plugin.notionClient = {
			isDatabaseInitialized: () => true,
			queryAllPages: async () => [page("T-001", "2024-06-01T00:00:00.000Z")],
			getPageContent: async () => [],
		};
		await plugin.initializeFileEntityIdCache();

		await plugin.pollNotionForChanges();

		const fm = parseFrontmatter(vault._files.get("tasks/T-001.md")!)!;
		expect(fm.title).toBe("From Notion");
	});

	it("leaves the local file alone when it is newer than the Notion page", async () => {
		const { plugin, vault } = makePlugin({
			"tasks/T-002.md": note({
				type: "task",
				id: "T-002",
				canvas_source: "b.canvas",
				updated_at: "2024-06-01T00:00:00.000Z",
			}),
		});
		plugin.settings.notionEnabled = true;
		plugin.notionClient = {
			isDatabaseInitialized: () => true,
			queryAllPages: async () => [page("T-002", "2024-01-01T00:00:00.000Z")],
			getPageContent: async () => [],
		};
		await plugin.initializeFileEntityIdCache();
		const before = vault._files.get("tasks/T-002.md");

		await plugin.pollNotionForChanges();

		expect(vault._files.get("tasks/T-002.md")).toBe(before);
	});

	it("ignores pages whose entity id is not in the local cache", async () => {
		const { plugin } = makePlugin();
		plugin.settings.notionEnabled = true;
		let contentFetched = false;
		plugin.notionClient = {
			isDatabaseInitialized: () => true,
			queryAllPages: async () => [page("T-999", "2024-06-01T00:00:00.000Z")],
			getPageContent: async () => {
				contentFetched = true;
				return [];
			},
		};

		await plugin.pollNotionForChanges();

		expect(contentFetched).toBe(false);
	});
});
