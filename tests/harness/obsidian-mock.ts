/**
 * Obsidian mock harness (Phase 5 / integration).
 *
 * A faithful-enough fake of the `obsidian` module so the plugin's module graph
 * (main.ts + settings.ts + util/*) can LOAD and its vault-touching flows can run
 * against an in-memory vault in jest — the seam that lets us integration-test the
 * ~5k lines of obsidian glue in main.ts that pure extraction can't reach.
 *
 * Only the surface the plugin actually uses is implemented. Wire it into a test with:
 *   jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });
 */

export function normalizePath(path: string): string {
	// Mirror obsidian's normalizePath: collapse slashes, trim, drop leading/trailing "/".
	return path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.trim();
}

export class TAbstractFile {
	path: string;
	name: string;
	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
	}
}

export class TFile extends TAbstractFile {
	extension: string;
	basename: string;
	constructor(path: string) {
		super(path);
		const dot = this.name.lastIndexOf(".");
		this.extension = dot >= 0 ? this.name.slice(dot + 1) : "";
		this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
	}
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

export class Notice {
	static instances: string[] = [];
	constructor(public message: string) {
		Notice.instances.push(message);
	}
}

/** In-memory vault adapter (the low-level `vault.adapter` surface). */
class MockAdapter {
	constructor(private vault: MockVault) {}
	async exists(path: string): Promise<boolean> {
		const p = normalizePath(path);
		return this.vault._files.has(p) || this.vault._folders.has(p);
	}
	async write(path: string, content: string): Promise<void> {
		this.vault._files.set(normalizePath(path), content);
	}
	async read(path: string): Promise<string> {
		const p = normalizePath(path);
		if (!this.vault._files.has(p)) throw new Error(`ENOENT: ${p}`);
		return this.vault._files.get(p)!;
	}
	async remove(path: string): Promise<void> {
		this.vault._files.delete(normalizePath(path));
	}
	async mkdir(path: string): Promise<void> {
		this.vault._folders.add(normalizePath(path));
	}
}

export class Vault {
	_files = new Map<string, string>();
	_folders = new Set<string>();
	adapter = new MockAdapter(this);
	configDir = ".obsidian";

	getAbstractFileByPath(path: string): TAbstractFile | null {
		const p = normalizePath(path);
		if (this._files.has(p)) return new TFile(p);
		if (this._folders.has(p)) return new TFolder(p);
		return null;
	}
	async read(file: TFile | { path: string }): Promise<string> {
		return this.adapter.read(file.path);
	}
	async cachedRead(file: TFile | { path: string }): Promise<string> {
		return this.adapter.read(file.path);
	}
	async create(path: string, content: string): Promise<TFile> {
		const p = normalizePath(path);
		this._files.set(p, content);
		return new TFile(p);
	}
	async modify(file: TFile | { path: string }, content: string): Promise<void> {
		this._files.set(normalizePath(file.path), content);
	}
	async createFolder(path: string): Promise<TFolder> {
		const p = normalizePath(path);
		this._folders.add(p);
		return new TFolder(p);
	}
	async rename(file: TFile | { path: string }, newPath: string): Promise<void> {
		const p = normalizePath(file.path);
		const np = normalizePath(newPath);
		if (this._files.has(p)) {
			this._files.set(np, this._files.get(p)!);
			this._files.delete(p);
		}
	}
	getMarkdownFiles(): TFile[] {
		return [...this._files.keys()].filter((p) => p.endsWith(".md")).map((p) => new TFile(p));
	}
	getFiles(): TFile[] {
		return [...this._files.keys()].map((p) => new TFile(p));
	}
	on(): { unload: () => void } {
		return { unload: () => {} };
	}
}

export class Workspace {
	getActiveFile(): TFile | null {
		return null;
	}
	getLeavesOfType(): unknown[] {
		return [];
	}
	on(): { unload: () => void } {
		return { unload: () => {} };
	}
}

export class MetadataCache {
	getFileCache(): unknown {
		return null;
	}
	on(): { unload: () => void } {
		return { unload: () => {} };
	}
}

export class App {
	vault = new Vault();
	workspace = new Workspace();
	metadataCache = new MetadataCache();
}

export class Plugin {
	app: App;
	manifest: unknown;
	constructor(app: App, manifest: unknown) {
		this.app = app;
		this.manifest = manifest;
	}
	addCommand<T>(cmd: T): T {
		return cmd;
	}
	addRibbonIcon(): HTMLElement {
		return {} as HTMLElement;
	}
	addSettingTab(): void {}
	registerEvent(): void {}
	registerDomEvent(): void {}
	registerInterval(): number {
		return 0;
	}
	registerMarkdownPostProcessor(): void {}
	register(): void {}
	async loadData(): Promise<unknown> {
		return {};
	}
	async saveData(): Promise<void> {}
}

export class PluginSettingTab {
	constructor(public app: App, public plugin: unknown) {}
	display(): void {}
}

/** Chainable no-op Setting builder (settings.ts uses the fluent API). */
export class Setting {
	constructor(_containerEl?: unknown) {}
	setName(): this {
		return this;
	}
	setDesc(): this {
		return this;
	}
	addText(): this {
		return this;
	}
	addTextArea(): this {
		return this;
	}
	addToggle(): this {
		return this;
	}
	addButton(): this {
		return this;
	}
	addDropdown(): this {
		return this;
	}
	addSlider(): this {
		return this;
	}
	setHeading(): this {
		return this;
	}
}

export class Modal {
	constructor(public app: App) {}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class Menu {
	addItem(): this {
		return this;
	}
	showAtMouseEvent(): void {}
}
export class MenuItem {
	setTitle(): this {
		return this;
	}
	setIcon(): this {
		return this;
	}
	onClick(): this {
		return this;
	}
}
export class View {}
export class WorkspaceLeaf {}

/** Minimal element stub for ItemView.containerEl chains. */
function stubEl(): Record<string, (...a: unknown[]) => unknown> {
	const el: Record<string, (...a: unknown[]) => unknown> = {
		empty: () => undefined,
		createEl: () => stubEl(),
		createDiv: () => stubEl(),
		createSpan: () => stubEl(),
		setText: () => undefined,
		addClass: () => undefined,
		removeClass: () => undefined,
		addEventListener: () => undefined,
		appendChild: () => undefined,
	};
	return el;
}

export class ItemView {
	leaf: WorkspaceLeaf;
	containerEl = { children: [stubEl(), stubEl()], ...stubEl() };
	constructor(leaf: WorkspaceLeaf) {
		this.leaf = leaf;
	}
	getViewType(): string {
		return "";
	}
	getDisplayText(): string {
		return "";
	}
	async onOpen(): Promise<void> {}
	async onClose(): Promise<void> {}
	registerEvent(): void {}
	addAction(): unknown {
		return {};
	}
}

export type RequestUrlParam = { url: string; method?: string; headers?: Record<string, string>; body?: string };
export async function requestUrl(_params: RequestUrlParam): Promise<{ status: number; json: unknown; text: string }> {
	return { status: 200, json: {}, text: "" };
}

/** Helper: build an App with an optional seed of file path → content. */
export function createTestApp(seed: Record<string, string> = {}): App {
	const app = new App();
	for (const [path, content] of Object.entries(seed)) {
		app.vault._files.set(normalizePath(path), content);
	}
	return app;
}
