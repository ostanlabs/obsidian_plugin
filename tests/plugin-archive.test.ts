/**
 * Integration: moveArchivedFilesToArchive() against the in-memory obsidian mock.
 * Seeds entity notes in a base folder, marks some archived, and asserts they are
 * relocated into <baseFolder>/archive/<typeFolder>/ while active/unknown/already
 * archived files are left in place.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Vault } from "./harness/obsidian-mock";

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
	};
}

function note(fields: Record<string, string>): string {
	// parseFrontmatter/isPluginCreatedNote need type+title+id; default a title.
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

describe("moveArchivedFilesToArchive (integration via obsidian mock)", () => {
	it("moves archived files into archive/<typeFolder> and leaves active files alone", async () => {
		const { plugin, vault } = makePlugin({
			// archived via `archived: true`
			"Projects/tasks/T-001_alpha.md": note({ type: "task", id: "T-001", archived: "true" }),
			// archived via `status: Archived`
			"Projects/stories/S-001_beta.md": note({ type: "story", id: "S-001", status: "Archived" }),
			// active - should stay
			"Projects/tasks/T-002_gamma.md": note({ type: "task", id: "T-002", status: "In Progress" }),
			// already in archive - excluded by the archive-path filter
			"Projects/archive/tasks/T-003_old.md": note({ type: "task", id: "T-003", archived: "true" }),
		});

		const moved = (await plugin.moveArchivedFilesToArchive("Projects")) as number;

		expect(moved).toBe(2);
		// relocated
		expect(vault._files.has("Projects/archive/tasks/T-001_alpha.md")).toBe(true);
		expect(vault._files.has("Projects/tasks/T-001_alpha.md")).toBe(false);
		expect(vault._files.has("Projects/archive/stories/S-001_beta.md")).toBe(true);
		expect(vault._files.has("Projects/stories/S-001_beta.md")).toBe(false);
		// active untouched
		expect(vault._files.has("Projects/tasks/T-002_gamma.md")).toBe(true);
		// already-archived file not moved again
		expect(vault._files.has("Projects/archive/tasks/T-003_old.md")).toBe(true);
	});

	it("skips archived files whose type is unknown (e.g. feature)", async () => {
		const { plugin, vault } = makePlugin({
			"Projects/features/F-001_x.md": note({ type: "feature", id: "F-001", archived: "true" }),
			"Projects/tasks/T-010_y.md": note({ type: "task", id: "T-010", archived: "true" }),
		});

		const moved = (await plugin.moveArchivedFilesToArchive("Projects")) as number;

		// feature isn't in the archivable entity-type set, so only the task moves
		expect(moved).toBe(1);
		expect(vault._files.has("Projects/features/F-001_x.md")).toBe(true);
		expect(vault._files.has("Projects/archive/tasks/T-010_y.md")).toBe(true);
	});

	it("skips files without frontmatter and returns 0 when nothing is archived", async () => {
		const { plugin, vault } = makePlugin({
			"Projects/notes/plain.md": "no frontmatter here",
			"Projects/tasks/T-020_active.md": note({ type: "task", id: "T-020", status: "Not Started" }),
		});

		const moved = (await plugin.moveArchivedFilesToArchive("Projects")) as number;

		expect(moved).toBe(0);
		expect(vault._files.has("Projects/notes/plain.md")).toBe(true);
		expect(vault._files.has("Projects/tasks/T-020_active.md")).toBe(true);
	});

	it("with an empty base folder, scans the whole vault (still excluding archive/)", async () => {
		const { plugin, vault } = makePlugin({
			"decisions/D-001_z.md": note({ type: "decision", id: "D-001", archived: "true" }),
			"archive/tasks/T-030_already.md": note({ type: "task", id: "T-030", archived: "true" }),
		});

		const moved = (await plugin.moveArchivedFilesToArchive("")) as number;

		expect(moved).toBe(1);
		// base-relative archive path when baseFolder === "" is "archive/<typeFolder>"
		expect(vault._files.has("archive/decisions/D-001_z.md")).toBe(true);
		expect(vault._files.has("decisions/D-001_z.md")).toBe(false);
		// pre-existing archive file untouched
		expect(vault._files.has("archive/tasks/T-030_already.md")).toBe(true);
	});
});
