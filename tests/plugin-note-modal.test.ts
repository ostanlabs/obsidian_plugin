/**
 * Integration: convertNoteToStructuredItem — the structured-item modal entry point —
 * against the in-memory obsidian mock. The flow reads the note via
 * parseFrontmatterAndBody (raw string scalars, merge-safe) and hands frontmatter+body to
 * a StructuredItemModal whose submit callback runs performNoteConversion. Modals can't
 * render headless, so Modal.prototype.open is spied to capture the constructed modal;
 * the captured onSubmit callback is then driven directly.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, Modal, Notice, TFile, Vault } from "./harness/obsidian-mock";
import { parseFrontmatter } from "../util/frontmatter";
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

type CapturedModal = {
	options: { modalTitle: string; currentTitle?: string; showTitleInput: boolean };
	onSubmit: (result: { type: string; effort: string; alias?: string }) => Promise<void>;
};

describe("convertNoteToStructuredItem (integration via obsidian mock)", () => {
	const openedModals: CapturedModal[] = [];

	beforeEach(() => {
		_resetSessionHighWaterForTests();
		Notice.instances = [];
		openedModals.length = 0;
		jest.spyOn(Modal.prototype, "open").mockImplementation(function (this: unknown) {
			openedModals.push(this as CapturedModal);
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("opens the conversion modal with the note's basename as current title", async () => {
		const { plugin } = makePlugin({ "notes/My Idea.md": "raw body\n" });

		await plugin.convertNoteToStructuredItem(new TFile("notes/My Idea.md"));

		expect(openedModals).toHaveLength(1);
		expect(openedModals[0].options.modalTitle).toBe("Convert to Structured Item");
		expect(openedModals[0].options.currentTitle).toBe("My Idea");
		expect(openedModals[0].options.showTitleInput).toBe(false);
	});

	it("submit converts the note, passing the parsed frontmatter+body through (raw scalars preserved)", async () => {
		const original = [
			"---",
			"created_at: 2020-01-01T00:00:00.000Z",
			"status: In Progress",
			"---",
			"",
			"The original body text.",
		].join("\n");
		const { plugin, vault } = makePlugin({ "notes/Legacy Note.md": original });

		await plugin.convertNoteToStructuredItem(new TFile("notes/Legacy Note.md"));
		expect(openedModals).toHaveLength(1);
		// drive the modal's submit callback (what StructuredItemModal.submit() invokes)
		await openedModals[0].onSubmit({ type: "story", effort: "growth", alias: "legacy" });

		const content = vault._files.get("notes/Legacy Note.md")!;
		const fm = parseFrontmatter(content)!;
		expect(fm.type).toBe("story");
		expect(fm.id).toBe("S-001");
		expect(fm.title).toBe("Legacy Note");
		expect(fm.workstream).toBe("growth");
		// parseFrontmatterAndBody kept the raw scalar; conversion preserved it verbatim
		expect(fm.created_at).toBe("2020-01-01T00:00:00.000Z");
		// existing status survives (normalized, not reset)
		expect(fm.status).toBe("In Progress");
		// body carried through
		expect(content).toContain("The original body text.");
	});

	it("submit on a plain note (no frontmatter) produces full structured frontmatter with defaults", async () => {
		const { plugin, vault } = makePlugin({ "notes/Plain.md": "just text\n" });

		await plugin.convertNoteToStructuredItem(new TFile("notes/Plain.md"));
		await openedModals[0].onSubmit({ type: "task", effort: "core" });

		const fm = parseFrontmatter(vault._files.get("notes/Plain.md")!)!;
		expect(fm.type).toBe("task");
		expect(fm.id).toBe("T-001");
		expect(fm.status).toBe("Not Started");
		expect(fm.priority).toBe("Medium");
		expect(fm.created_by_plugin).toBe(true);
	});

	it("notices and does not open a modal when the file cannot be read", async () => {
		const { plugin } = makePlugin();

		await plugin.convertNoteToStructuredItem(new TFile("notes/missing.md"));

		expect(openedModals).toHaveLength(0);
		expect(Notice.instances.join("\n")).toContain("Failed to convert note");
	});
});
