/**
 * Integration: the vault-wide relationship reconciler against the in-memory obsidian
 * mock. This is the densest reachable flow in main.ts — it scans every markdown file,
 * builds a forward/reverse relationship graph, prunes broken references, writes the
 * computed inverse fields back, and breaks dependency cycles. Fully vault-I/O (no canvas
 * render). Also covers sanitizeParentFields (array→scalar), which runs as its pre-pass
 * and (since Phase 4) reads file content through the canonical entity-core parse
 * instead of the raw metadataCache.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Vault } from "./harness/obsidian-mock";
import { parseRawFrontmatter } from "../util/frontmatter";

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

/** Frontmatter note; array fields must be passed pre-serialized (e.g. depends_on: "[A-1]"). */
function note(fields: Record<string, string>): string {
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

describe("reconcileAllRelationships (integration via obsidian mock)", () => {
	it("computes reverse relationships (blocks/children/implemented_by) across the vault", async () => {
		const { plugin, vault } = makePlugin({
			// T-2 depends_on T-1 => T-1.blocks should include T-2
			"tasks/T-1.md": note({ type: "task", id: "T-1" }),
			"tasks/T-2.md": note({ type: "task", id: "T-2", depends_on: "[T-1]" }),
			// S-1 parent M-1 => M-1.children should include S-1
			"stories/S-1.md": note({ type: "story", id: "S-1", parent: "M-1" }),
			"milestones/M-1.md": note({ type: "milestone", id: "M-1" }),
			// S-2 implements F-1 => F-1.implemented_by should include S-2
			"stories/S-2.md": note({ type: "story", id: "S-2", implements: "[F-1]" }),
			"features/F-1.md": note({ type: "feature", id: "F-1" }),
		});

		await plugin.reconcileAllRelationships();

		expect(parseRawFrontmatter(vault._files.get("tasks/T-1.md")!)!.blocks).toEqual(["T-2"]);
		expect(parseRawFrontmatter(vault._files.get("milestones/M-1.md")!)!.children).toEqual(["S-1"]);
		expect(parseRawFrontmatter(vault._files.get("features/F-1.md")!)!.implemented_by).toEqual(["S-2"]);
	});

	it("prunes broken forward references (depends_on pointing at a non-existent entity)", async () => {
		const { plugin, vault } = makePlugin({
			// T-5 depends_on [T-4, T-999]; T-999 is a valid-shaped id that does not exist -> pruned
			"tasks/T-4.md": note({ type: "task", id: "T-4" }),
			"tasks/T-5.md": note({ type: "task", id: "T-5", depends_on: "[T-4, T-999]" }),
		});

		await plugin.reconcileAllRelationships();

		const fm = parseRawFrontmatter(vault._files.get("tasks/T-5.md")!)!;
		expect(fm.depends_on).toEqual(["T-4"]);
		// and the surviving reference produced its inverse
		expect(parseRawFrontmatter(vault._files.get("tasks/T-4.md")!)!.blocks).toEqual(["T-5"]);
	});

	it("prunes non-ID-shaped garbage tokens from a forward relationship field, keeping valid ids", async () => {
		const { plugin, vault } = makePlugin({
			// depends_on holds a valid id (T-4) plus free-text garbage that cleanEntityId drops
			// at read time. The garbage must be REMOVED from disk, not silently kept.
			"tasks/T-4.md": note({ type: "task", id: "T-4" }),
			"tasks/T-6.md": note({ type: "task", id: "T-6", depends_on: "[T-4, see the other task]" }),
			// implements with a garbage token too
			"features/F-1.md": note({ type: "feature", id: "F-1" }),
			"stories/S-3.md": note({ type: "story", id: "S-3", implements: "[F-1, TODO figure this out]" }),
		});

		await plugin.reconcileAllRelationships();

		const t6 = parseRawFrontmatter(vault._files.get("tasks/T-6.md")!)!;
		expect(t6.depends_on).toEqual(["T-4"]);
		// valid reference preserved and its inverse produced
		expect(parseRawFrontmatter(vault._files.get("tasks/T-4.md")!)!.blocks).toEqual(["T-6"]);

		const s3 = parseRawFrontmatter(vault._files.get("stories/S-3.md")!)!;
		expect(s3.implements).toEqual(["F-1"]);
		expect(parseRawFrontmatter(vault._files.get("features/F-1.md")!)!.implemented_by).toEqual(["S-3"]);
	});

	it("does NOT delete a parent reference that is merely missing from the vault (warn-only)", async () => {
		const { plugin, vault } = makePlugin({
			// parent M-404 not present; reconciler warns but must preserve the field
			"stories/S-9.md": note({ type: "story", id: "S-9", parent: "M-404" }),
		});

		await plugin.reconcileAllRelationships();

		expect(parseRawFrontmatter(vault._files.get("stories/S-9.md")!)!.parent).toBe("M-404");
	});

	it("writes an operation-log file on a standalone run", async () => {
		const { plugin, vault } = makePlugin({
			"tasks/T-1.md": note({ type: "task", id: "T-1" }),
		});

		await plugin.reconcileAllRelationships();

		expect(vault._files.has("operation-log.txt")).toBe(true);
		expect(vault._files.get("operation-log.txt")!).toContain("[Reconciler] COMPLETE");
	});

	it("prefers the active file over an archived duplicate when the same id appears twice", async () => {
		const { plugin, vault } = makePlugin({
			"archive/tasks/T-7.md": note({ type: "task", id: "T-7", archived: "true" }),
			"tasks/T-7.md": note({ type: "task", id: "T-7" }),
			// something that blocks T-7 so the active file receives the inverse write
			"tasks/T-8.md": note({ type: "task", id: "T-8", depends_on: "[T-7]" }),
		});

		await plugin.reconcileAllRelationships();

		// the active (non-archived) T-7 gets the blocks inverse; archived one is left out of the map
		expect(parseRawFrontmatter(vault._files.get("tasks/T-7.md")!)!.blocks).toEqual(["T-8"]);
	});
});

describe("sanitizeParentFields (integration via obsidian mock)", () => {
	it("rewrites a malformed array-valued parent field to its first scalar value", async () => {
		const { plugin, vault } = makePlugin({
			// parent stored as an array — malformed; should collapse to the first element
			"stories/S-1.md": note({ type: "story", id: "S-1", parent: '["M-1", "M-2"]' }),
			"milestones/M-1.md": note({ type: "milestone", id: "M-1" }),
			"milestones/M-2.md": note({ type: "milestone", id: "M-2" }),
		});

		const log: string[] = [];
		await plugin.sanitizeParentFields(log);

		expect(parseRawFrontmatter(vault._files.get("stories/S-1.md")!)!.parent).toBe("M-1");
		expect(log.join("\n")).toContain("Sanitizing parent field from array");
	});

	it("leaves scalar parent fields untouched", async () => {
		const { plugin, vault } = makePlugin({
			"stories/S-2.md": note({ type: "story", id: "S-2", parent: "M-9" }),
		});
		const before = vault._files.get("stories/S-2.md");

		await plugin.sanitizeParentFields([]);

		expect(vault._files.get("stories/S-2.md")).toBe(before);
	});
});
