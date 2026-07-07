/**
 * Integration: entity-ID generation (generateEntityId → util/idGenerator.generateId)
 * against the in-memory obsidian mock. The fallback generator scans every markdown
 * file's frontmatter via metadataCache.getFileCache — the harness now backs that with
 * the seeded vault content, so we can assert the highest-ID-plus-one behaviour per type.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Vault } from "./harness/obsidian-mock";
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
	};
}

function note(fields: Record<string, string>): string {
	const withTitle = { title: fields.id ? `${fields.id} title` : "untitled", ...fields };
	const lines = ["---", ...Object.entries(withTitle).map(([k, v]) => `${k}: ${v}`), "---", "", "body"];
	return lines.join("\n");
}

describe("generateEntityId fallback (integration via obsidian mock)", () => {
	beforeEach(() => _resetSessionHighWaterForTests());

	it("starts at 001 (padded) for a type with no existing entities", async () => {
		const { plugin } = makePlugin();
		const id = (await plugin.generateEntityId("task")) as string;
		expect(id).toBe("T-001");
	});

	it("uses the correct prefix for each entity type", async () => {
		const { plugin } = makePlugin();
		expect(await plugin.generateEntityId("milestone")).toBe("M-001");
		expect(await plugin.generateEntityId("story")).toBe("S-001");
		expect(await plugin.generateEntityId("decision")).toBe("DEC-001");
		expect(await plugin.generateEntityId("document")).toBe("DOC-001");
		expect(await plugin.generateEntityId("feature")).toBe("F-001");
	});

	it("returns highest-existing + 1, scanning frontmatter across the vault", async () => {
		const { plugin } = makePlugin({
			"tasks/a.md": note({ type: "task", id: "T-004" }),
			"tasks/b.md": note({ type: "task", id: "T-009" }),
			"tasks/c.md": note({ type: "task", id: "T-002" }),
			// a different prefix must not affect the task counter
			"stories/s.md": note({ type: "story", id: "S-050" }),
		});
		const id = (await plugin.generateEntityId("task")) as string;
		expect(id).toBe("T-010");
	});

	it("advances the per-session high-water mark on repeated calls in the same tick", async () => {
		const { plugin } = makePlugin({
			"tasks/a.md": note({ type: "task", id: "T-003" }),
		});
		const first = (await plugin.generateEntityId("task")) as string;
		const second = (await plugin.generateEntityId("task")) as string;
		expect(first).toBe("T-004");
		// metadataCache hasn't seen a new file, but the high-water mark prevents a collision
		expect(second).toBe("T-005");
	});

	it("ignores files without frontmatter and non-matching id shapes", async () => {
		const { plugin } = makePlugin({
			"notes/plain.md": "no frontmatter",
			"tasks/weird.md": note({ type: "task", id: "T-notanumber" }),
			"tasks/real.md": note({ type: "task", id: "T-007" }),
		});
		expect(await plugin.generateEntityId("task")).toBe("T-008");
	});
});
