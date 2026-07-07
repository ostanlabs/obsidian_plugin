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
	/**
	 * File metadata mirroring obsidian's TFile.stat. Populated by the Vault when a
	 * TFile is produced from a real in-memory file (size from content length,
	 * mtime/ctime from the vault's write clock); a bare `new TFile()` gets zeros.
	 */
	stat: { size: number; mtime: number; ctime: number } = { size: 0, mtime: 0, ctime: 0 };
	constructor(path: string) {
		super(path);
		const dot = this.name.lastIndexOf(".");
		this.extension = dot >= 0 ? this.name.slice(dot + 1) : "";
		this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
	}
	/**
	 * Containing folder, mirroring obsidian's TFile.parent. A top-level file's
	 * parent is the (empty-path) root folder, never null — matching obsidian.
	 */
	get parent(): TFolder {
		const slash = this.path.lastIndexOf("/");
		return new TFolder(slash >= 0 ? this.path.slice(0, slash) : "");
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
		const p = normalizePath(path);
		this.vault._files.set(p, content);
		this.vault._mtimes.set(p, Date.now());
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
	/** Write clock, so TFile.stat.mtime reflects the last write to a path. */
	_mtimes = new Map<string, number>();
	adapter = new MockAdapter(this);
	configDir = ".obsidian";

	getAbstractFileByPath(path: string): TAbstractFile | null {
		const p = normalizePath(path);
		if (this._files.has(p)) return this._makeFile(p);
		if (this._folders.has(p)) return this._makeFolder(p);
		return null;
	}

	/** Build a TFile with stat backed by the in-memory content + write clock. */
	private _makeFile(p: string): TFile {
		const f = new TFile(p);
		const content = this._files.get(p) ?? "";
		const mtime = this._mtimes.get(p) ?? 0;
		f.stat = { size: content.length, mtime, ctime: mtime };
		return f;
	}

	/** Build a TFolder whose `children` are its DIRECT files/subfolders. */
	private _makeFolder(p: string): TFolder {
		const folder = new TFolder(p);
		folder.children = this._childrenOf(p);
		return folder;
	}

	private _childrenOf(folderPath: string): TAbstractFile[] {
		const children: TAbstractFile[] = [];
		const prefix = folderPath === "" ? "" : folderPath + "/";
		for (const fp of this._files.keys()) {
			if (!fp.startsWith(prefix)) continue;
			const rest = fp.slice(prefix.length);
			if (rest.length > 0 && !rest.includes("/")) children.push(this._makeFile(fp));
		}
		for (const dp of this._folders.keys()) {
			if (!dp.startsWith(prefix)) continue;
			const rest = dp.slice(prefix.length);
			if (rest.length > 0 && !rest.includes("/")) children.push(this._makeFolder(dp));
		}
		return children;
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
		this._mtimes.set(p, Date.now());
		return this._makeFile(p);
	}
	async modify(file: TFile | { path: string }, content: string): Promise<void> {
		const p = normalizePath(file.path);
		this._files.set(p, content);
		this._mtimes.set(p, Date.now());
	}
	async createFolder(path: string): Promise<TFolder> {
		const p = normalizePath(path);
		this._folders.add(p);
		return new TFolder(p);
	}
	/**
	 * Remove a file, or a folder (recursively when `recursive` is true), mirroring
	 * obsidian's Vault.delete. Used by the entity-core ObsidianVaultAdapter's
	 * deleteFile/deleteFolder. Deleting a missing path is a silent no-op.
	 */
	async delete(file: TAbstractFile | { path: string }, recursive = false): Promise<void> {
		const p = normalizePath(file.path);
		if (this._files.has(p)) {
			this._files.delete(p);
			this._mtimes.delete(p);
			return;
		}
		if (this._folders.has(p)) {
			this._folders.delete(p);
			if (recursive) {
				for (const fp of [...this._files.keys()]) {
					if (fp.startsWith(p + "/")) {
						this._files.delete(fp);
						this._mtimes.delete(fp);
					}
				}
				for (const dp of [...this._folders.keys()]) {
					if (dp.startsWith(p + "/")) this._folders.delete(dp);
				}
			}
		}
	}
	async rename(file: TFile | { path: string }, newPath: string): Promise<void> {
		const p = normalizePath(file.path);
		const np = normalizePath(newPath);
		if (this._files.has(p)) {
			this._files.set(np, this._files.get(p)!);
			this._files.delete(p);
			this._mtimes.set(np, this._mtimes.get(p) ?? Date.now());
			this._mtimes.delete(p);
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

/** A single fake workspace leaf; openFile records the file it was asked to open. */
export class MockLeaf {
	openedFile: TFile | { path: string } | null = null;
	async openFile(file: TFile | { path: string }): Promise<void> {
		this.openedFile = file;
	}
}

export class Workspace {
	/** Settable active file so flows gated on getActiveFile()/getActiveCanvasFile() are reachable. */
	_activeFile: TFile | null = null;
	/** Every leaf handed out via getLeaf(), so tests can assert what was opened. */
	leaves: MockLeaf[] = [];
	getActiveFile(): TFile | null {
		return this._activeFile;
	}
	getLeaf(..._args: unknown[]): MockLeaf {
		const leaf = new MockLeaf();
		this.leaves.push(leaf);
		return leaf;
	}
	getActiveViewOfType(): unknown {
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
	constructor(private vault?: Vault) {}
	/**
	 * Return the parsed frontmatter for a file the way obsidian's metadataCache does:
	 * `{ frontmatter: {...} }` when the file has a `---` block, else `null`. Backed by
	 * the in-memory vault so idGenerator scans / sanitizeParentFields / reconcile flows
	 * that read cache.frontmatter behave against seeded content.
	 */
	getFileCache(file?: TFile | { path: string }): { frontmatter?: Record<string, unknown> } | null {
		if (!this.vault || !file) return null;
		const content = this.vault._files.get(normalizePath(file.path));
		if (content === undefined) return null;
		const { fm } = parseFrontmatterBlock(content);
		if (Object.keys(fm).length === 0) return null;
		return { frontmatter: fm };
	}
	on(): { unload: () => void } {
		return { unload: () => {} };
	}
}

/**
 * Parse a single YAML frontmatter scalar/array value the way the plugin's own
 * parser does, so processFrontMatter round-trips faithfully.
 */
function parseFmScalar(raw: string): unknown {
	const v = raw.trim();
	if (v === "") return "";
	if (v.startsWith("[") && v.endsWith("]")) {
		try {
			const parsed = JSON.parse(v);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			const inner = v.slice(1, -1).trim();
			if (inner === "") return [];
			return inner
				.split(",")
				.map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
				.filter((s) => s.length > 0);
		}
	}
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		return v.slice(1, -1);
	}
	if (v === "true") return true;
	if (v === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
	return v;
}

/** Parse a `---`-delimited frontmatter block into an ordered object + trailing body. */
function parseFrontmatterBlock(content: string): { fm: Record<string, unknown>; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) return { fm: {}, body: content };
	const lines = match[1].split("\n");
	const fm: Record<string, unknown> = {};
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		if (!key) continue;
		const rest = line.slice(colon + 1).trim();
		// Multiline YAML array: `key:` followed by `  - item` lines.
		if (rest === "" && /^[ \t]*-[ \t]*/.test(lines[i + 1] ?? "")) {
			const items: string[] = [];
			while (i + 1 < lines.length && /^[ \t]*-[ \t]*/.test(lines[i + 1])) {
				items.push(lines[++i].replace(/^[ \t]*-[ \t]*/, "").trim().replace(/^['"]|['"]$/g, ""));
			}
			fm[key] = items;
		} else {
			fm[key] = parseFmScalar(rest);
		}
	}
	return { fm, body: content.slice(match[0].length) };
}

/** Serialize an ordered frontmatter object back into a `---` block. Arrays as JSON. */
function serializeFrontmatterBlock(fm: Record<string, unknown>, body: string): string {
	const lines = ["---"];
	for (const [key, value] of Object.entries(fm)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) lines.push(`${key}: ${JSON.stringify(value)}`);
		else if (value === "" || value === null) lines.push(`${key}:`);
		else lines.push(`${key}: ${String(value)}`);
	}
	lines.push("---");
	return lines.join("\n") + (body.startsWith("\n") ? body : "\n" + body);
}

/**
 * In-memory `app.fileManager`. Faithful to the obsidian surface the plugin uses:
 * processFrontMatter (read → mutate object → write back), renameFile, trashFile.
 */
export class FileManager {
	constructor(private vault: Vault) {}

	async processFrontMatter(file: TFile | { path: string }, fn: (fm: Record<string, unknown>) => void): Promise<void> {
		const content = await this.vault.read(file);
		const { fm, body } = parseFrontmatterBlock(content);
		fn(fm);
		await this.vault.modify(file, serializeFrontmatterBlock(fm, body));
	}

	async renameFile(file: TFile | { path: string }, newPath: string): Promise<void> {
		await this.vault.rename(file, newPath);
	}

	async trashFile(file: TFile | { path: string }): Promise<void> {
		this.vault._files.delete(normalizePath(file.path));
	}
}

export class App {
	vault = new Vault();
	workspace = new Workspace();
	metadataCache = new MetadataCache(this.vault);
	fileManager = new FileManager(this.vault);
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
