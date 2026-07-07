/**
 * Integration pilot: exercise real main.ts vault-touching flows against the
 * in-memory obsidian mock harness. This is the seam that lets us test the plugin's
 * obsidian glue (which pure extraction can't reach) and, later, refactor it safely.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp, TFile, Vault } from "./harness/obsidian-mock";

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
	// Plugin base stores app; field initializers set settings = DEFAULT_SETTINGS.
	const plugin = new CanvasStructuredItemsPlugin(app as never, MANIFEST as never);
	return { plugin: plugin as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>, app, vault: app.vault as unknown as Vault };
}

describe("plugin vault flows (integration via obsidian mock)", () => {
	it("main.ts loads under the mock and instantiates", () => {
		const { plugin } = makePlugin();
		expect(plugin).toBeTruthy();
		expect((plugin as unknown as { settings: unknown }).settings).toBeTruthy();
	});

	describe("ensureFolderExists", () => {
		it("creates a missing folder in the vault", async () => {
			const { plugin, vault } = makePlugin();
			await plugin.ensureFolderExists("projects/board");
			expect(vault._folders.has("projects/board")).toBe(true);
		});

		it("is idempotent when the folder already exists", async () => {
			const { plugin, vault } = makePlugin();
			await vault.createFolder("existing");
			await expect(plugin.ensureFolderExists("existing")).resolves.toBeUndefined();
			expect(vault._folders.has("existing")).toBe(true);
		});
	});

	describe("loadTemplate", () => {
		it("returns the template file's content when present", async () => {
			const { plugin } = makePlugin();
			(plugin as unknown as { settings: { templateFolder: string } }).settings.templateFolder = "templates";
			// seed the default template path loadTemplate looks up
			const { plugin: p2, vault } = makePlugin({ "templates/canvas-entity-template.md": "MY TEMPLATE BODY" });
			(p2 as unknown as { settings: { templateFolder: string } }).settings.templateFolder = "templates";
			void vault;
			const out = await p2.loadTemplate("task");
			expect(out).toBe("MY TEMPLATE BODY");
		});

		it("falls back to the built-in default template when the file is missing", async () => {
			const { plugin } = makePlugin();
			(plugin as unknown as { settings: { templateFolder: string } }).settings.templateFolder = "templates";
			const out = (await plugin.loadTemplate("task")) as string;
			expect(typeof out).toBe("string");
			expect(out.length).toBeGreaterThan(0);
			expect(out).not.toBe("MY TEMPLATE BODY");
		});

		it("reads a custom template path when provided", async () => {
			const { plugin } = makePlugin({ "custom/tpl.md": "CUSTOM TPL" });
			const out = await plugin.loadTemplate("task", "custom/tpl.md");
			expect(out).toBe("CUSTOM TPL");
		});
	});

	describe("determineNotePath (create-entity slice)", () => {
		it("routes to the type folder and ensures it exists", async () => {
			const { plugin, vault } = makePlugin();
			const canvasFile = new TFile("projects/board.canvas");
			const path = (await plugin.determineNotePath(canvasFile, "My Task", "T-001", "task")) as string;

			// tasks folder from default settings; filename is <ID>_<title>.md style
			const tasksFolder = (plugin as unknown as { settings: { entityNavigator: { tasksFolder: string } } }).settings.entityNavigator.tasksFolder;
			expect(path.startsWith(tasksFolder + "/")).toBe(true);
			expect(path.endsWith(".md")).toBe(true);
			expect(path).toContain("T-001");
			// side effect: the destination folder was created
			expect(vault._folders.has(tasksFolder)).toBe(true);
		});
	});
});
