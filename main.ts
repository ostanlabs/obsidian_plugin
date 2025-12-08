import { App, Plugin, TFile, Notice, normalizePath, TFolder, Menu, MenuItem } from "obsidian";
import {
	CanvasItemFromTemplateSettings,
	DEFAULT_SETTINGS,
	ItemFrontmatter,
	ItemType,
	ItemStatus,
	ItemPriority,
} from "./types";
import { CanvasStructuredItemsSettingTab } from "./settings";
import { StructuredItemModal, StructuredItemResult, StructuredItemModalOptions } from "./ui/StructuredItemModal";
import { NotionClient } from "./notion/notionClient";

// Result interfaces for internal mapping
interface ConvertNoteResult {
	type: ItemType;
	effort: string;
	alias?: string;
}

import { Logger } from "./util/logger";
import { generateId } from "./util/idGenerator";
import {
	DEFAULT_ACCOMPLISHMENT_TEMPLATE,
	replacePlaceholders,
} from "./util/template";
import { parseFrontmatter, updateFrontmatter, parseFrontmatterAndBody, createWithFrontmatter } from "./util/frontmatter";
import {
	loadCanvasData,
	saveCanvasData,
	findNodeById,
	convertTextNodeToFile,
	createNode,
	getCanvasCenter,
	getColorForEffort,
	addNode,
	removeNode,
	reloadCanvasViews,
	reloadCanvasViewsWithViewport,
	closeCanvasViews,
	reopenCanvasViews,
	CanvasNode,
	generateNodeId,
} from "./util/canvas";
import { generateUniqueFilename, isPluginCreatedNote } from "./util/fileNaming";

const COLLAPSED_HEIGHT_DEFAULT = 100;
const EXPANDED_HEIGHT_DEFAULT = 220;
const EXPANDED_WIDTH_DEFAULT = 400;

export default class CanvasStructuredItemsPlugin extends Plugin {
	settings: CanvasItemFromTemplateSettings = DEFAULT_SETTINGS;
	notionClient: NotionClient | null = null;
	logger: Logger | null = null;
	// Track canvas nodes to detect deletions
	private canvasNodeCache: Map<string, Set<string>> = new Map();
	// Flag to prevent deletion detection during our own updates
	private isUpdatingCanvas: boolean = false;
	// Track selection overlay buttons
	private selectionButtons: Map<string, HTMLElement> = new Map();
	// Track last selected text node for menu injection
	private lastSelectedMenuNode: any = null;
	private selectionMenuIntervalId: number | null = null;
	// Track node size for resize detection
	private lastPointerNodeSize: { id: string; width: number; height: number; ref: any; el: HTMLElement } | null = null;
	private nodeSizeCache: WeakMap<HTMLElement, { w: number; h: number }> = new WeakMap();
	private isResizing: boolean = false;

	private getCanvasNodeFromEventTarget(target: EventTarget | null): any {
		if (!(target instanceof HTMLElement)) return null;
		const selectors = [".canvas-node", ".canvas-card"];
		for (const sel of selectors) {
			const el = target.closest(sel) as HTMLElement | null;
			if (el) {
				const node = this.findCanvasNodeByElement(el);
				return node ? { node, el } : null;
			}
		}
		return null;
	}

	private setupCanvasResizeObserver(): void {
		const observer = new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (
					m.type === "attributes" &&
					m.attributeName === "style" &&
					m.target instanceof HTMLElement &&
					m.target.classList.contains("canvas-node")
				) {
					const el = m.target;
					const w = parseFloat(el.style.width || "") || el.clientWidth || el.getBoundingClientRect().width;
					const h = parseFloat(el.style.height || "") || el.clientHeight || el.getBoundingClientRect().height;
					const prev = this.nodeSizeCache.get(el);
					if (!prev || prev.w !== w || prev.h !== h) {
						this.nodeSizeCache.set(el, { w, h });
						const canvasNode = this.findCanvasNodeByElement(el);
						// Get node ID from getData() to locate node in file
						const data = canvasNode?.getData?.();
						if (!data?.id || !canvasNode?.canvas?.view?.file) {
							return;
						}

						this.isResizing = true;
						console.log("[Canvas Plugin] isResizing -> true (observer size change)");
						
						// Read file path and collapsed state from canvas file (source of truth)
						const canvasFile = canvasNode.canvas.view.file;
						loadCanvasData(this.app, canvasFile).then(canvasData => {
							const nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === data.id);
							if (nodeInFile) {
								console.log("[Canvas Plugin] Node resized (observer)", {
									id: nodeInFile.id,
									newWidth: w,
									newHeight: h,
									classList: Array.from(el.classList),
								});
								this.persistSizeOnResize(nodeInFile.file, nodeInFile.metadata?.collapsed, w, h);
							}
						}).catch(err => {
							console.error("[Canvas Plugin] Failed to read from canvas file during resize:", err);
						});
					}
				}
			}
		});

		observer.observe(document.body, {
			attributes: true,
			subtree: true,
			attributeFilter: ["style"],
		});

		this.register(() => observer.disconnect());
	}

	async onload() {
		await this.loadSettings();

		// Initialize logger
		this.logger = new Logger(this.app, "canvas-structured-items");
		await this.logger.info("Plugin loaded");

		// Initialize Notion client
		this.notionClient = new NotionClient(this.settings, this.logger);

		// Ensure templates exist
		await this.ensureTemplatesExist();

		// Add settings tab
		this.addSettingTab(new CanvasStructuredItemsSettingTab(this.app, this));

		// Register commands
		this.registerCommands();

	// Register canvas context menu (file explorer)
	this.registerEvent(
		this.app.workspace.on("file-menu", (menu, file) => {
			if (file instanceof TFile && file.extension === "canvas") {
				console.log("[Canvas Plugin] Canvas context menu opened (right-click on canvas file)", {
					canvasPath: file.path,
				});
				this.addCanvasContextMenu(menu, file);
			}
		})
	);

		// Register editor context menu for notes
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				const file = view.file;
				if (file && file.extension === "md") {
					this.addNoteContextMenu(menu, file);
				}
			})
		);

		// Setup canvas node context menu using DOM events
		this.setupCanvasNodeContextMenu();
		// Add selection-based convert button for text nodes
		this.setupCanvasSelectionButton();
		// Log text node clicks for debugging
		this.setupCanvasClickLogger();
		// Observe canvas node size changes
		this.setupCanvasResizeObserver();

		// Watch for canvas file modifications to detect node deletions
		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				if (file instanceof TFile && file.extension === "canvas") {
					await this.handleCanvasModification(file);
				}
			})
		);

		// Initialize cache after layout is ready (vault files are indexed)
		this.app.workspace.onLayoutReady(async () => {
			console.log('[Canvas Plugin] Layout ready, initializing canvas node cache...');
			await this.initializeCanvasNodeCache();
		});

		await this.logger.info("Plugin initialization complete");
	}

	onunload() {
		this.logger?.info("Plugin unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update Notion client with new settings
		if (this.notionClient) {
			this.notionClient.updateSettings(this.settings);
		}
	}

/**
 * Register all plugin commands
 */
private registerCommands(): void {
	// Command 1: Initialize Notion database
	this.addCommand({
		id: "initialize-notion-database",
		name: "Canvas Item: Initialize Notion Database",
		callback: async () => {
			await this.initializeNotionDatabase();
		},
	});

	// Command 2: Sync current note to Notion
	this.addCommand({
		id: "sync-current-note-to-notion",
		name: "Canvas Item: Sync Current Note to Notion",
		callback: async () => {
			await this.syncCurrentNoteToNotion();
		},
	});

	// Command 3: Regenerate templates
	this.addCommand({
		id: "regenerate-templates",
		name: "Canvas Item: Regenerate Templates",
		callback: async () => {
			await this.ensureTemplatesExist(true);
			new Notice("Templates regenerated successfully");
		},
	});

	// Command 4: Sync all notes in current canvas to Notion
	this.addCommand({
		id: "sync-canvas-notes-to-notion",
		name: "Canvas Item: Sync All Notes in Current Canvas to Notion",
		callback: async () => {
			await this.syncAllCanvasNotesToNotion();
		},
	});
}

	/**
	 * Get the active canvas file
	 */
	private getActiveCanvasFile(): TFile | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "canvas") {
			return null;
		}
		return activeFile;
	}

	/**
	 * Determine the path for the new note
	 */
	private async determineNotePath(
		canvasFile: TFile,
		title: string,
		_id: string // ID is no longer used in filename
	): Promise<string> {
		let baseFolder: string;

		if (this.settings.inferBaseFolderFromCanvas) {
			// Use the same folder as the canvas file
			baseFolder = canvasFile.parent?.path || "";
		} else {
			baseFolder = this.settings.notesBaseFolder;
		}

		// Ensure folder exists
		if (baseFolder) {
			await this.ensureFolderExists(baseFolder);
		}

		// Use title as filename, preserving whitespaces
		// generateUniqueFilename will add -index suffix if file already exists
		return await generateUniqueFilename(this.app, baseFolder, title, "md");
	}

	/**
	 * Ensure a folder exists
	 */
	private async ensureFolderExists(folderPath: string): Promise<void> {
		const normalizedPath = normalizePath(folderPath);
		const exists = await this.app.vault.adapter.exists(normalizedPath);

		if (!exists) {
			await this.app.vault.createFolder(normalizedPath);
			await this.logger?.info("Created folder", { path: normalizedPath });
		}
	}

	/**
	 * Load template for a given type
	 */
	private async loadTemplate(
		type: ItemType,
		customPath?: string
	): Promise<string> {
		let templatePath: string;

		// If custom template path provided, use it
		if (customPath) {
			templatePath = customPath;
		} else {
			// Use default template path from settings
			templatePath = this.settings.accomplishmentTemplatePath;
		}

		const file = this.app.vault.getAbstractFileByPath(templatePath);

		if (file instanceof TFile) {
			return await this.app.vault.read(file);
		}

		// Return default template if file not found
		await this.logger?.warn("Template not found, using default", {
			path: templatePath,
		});
		return DEFAULT_ACCOMPLISHMENT_TEMPLATE;
	}

	/**
	 * Update canvas with new/modified node
	 */
	private async updateCanvas(
		canvasFile: TFile,
		notePath: string,
		existingNodeId: string | null,
		title: string,
		effort: string | undefined,
		type: ItemType,
		options?: { alias?: string; collapsed?: boolean },
		sizeConfig?: { collapsedHeight: number; expandedHeight: number; expandedWidth?: number },
		inProgress?: boolean
	): Promise<void> {
		console.log('[Canvas Plugin] updateCanvas called:', {
			canvasPath: canvasFile.path,
			notePath,
			existingNodeId,
			effort,
			inProgress
		});

	const color = this.resolveNodeColor(effort, inProgress);
	const metadata = this.buildCanvasMetadata(type, title, effort, options, color);
	
	console.log('[Canvas Plugin] ===== START updateCanvas =====');
	console.log('[Canvas Plugin] Canvas file:', canvasFile.path);
	console.log('[Canvas Plugin] Note path:', notePath);
	console.log('[Canvas Plugin] Existing node ID:', existingNodeId);
	console.log('[Canvas Plugin] Metadata:', metadata);
	
	// Set flag to prevent deletion detection during our update
	this.isUpdatingCanvas = true;
	console.log('[Canvas Plugin] isUpdatingCanvas set to true');
	
	// Always use file-based approach (same as conversion flow) to ensure metadata is set
	console.log('[Canvas Plugin] Using file-based approach (write + reload)');
	
	// Load canvas data
	const canvasData = await loadCanvasData(this.app, canvasFile);
	
	if (existingNodeId) {
		// Update existing node
		const existingNode = canvasData.nodes.find((n: CanvasNode) => n.id === existingNodeId);
		if (existingNode) {
			existingNode.type = "file";
			existingNode.file = notePath;
			if (color) {
				existingNode.color = color;
			}
			existingNode.metadata = metadata;
			console.log('[Canvas Plugin] Updated existing node:', existingNode.id);
		}
	} else {
		// Create new node at center
		const center = getCanvasCenter(this.app, canvasFile);
		console.log('[Canvas Plugin] Center position:', center);
		
		// Ensure valid coordinates
		if (center.x === null || center.y === null || isNaN(center.x) || isNaN(center.y)) {
			console.warn('[Canvas Plugin] Invalid center coordinates, using fallback');
			center.x = 0;
			center.y = 0;
		}
		
		const collapsedHeight = sizeConfig?.collapsedHeight ?? COLLAPSED_HEIGHT_DEFAULT;
		const expandedHeight = sizeConfig?.expandedHeight ?? EXPANDED_HEIGHT_DEFAULT;
		const expandedWidth = sizeConfig?.expandedWidth ?? EXPANDED_WIDTH_DEFAULT;
		
		// Store expanded size in metadata (for when node is expanded) - align with conversion flow
		// buildCanvasMetadata always returns an object, so metadata is guaranteed to exist
		metadata!.expandedSize = { width: expandedWidth, height: expandedHeight };
		
		const newNode: CanvasNode = {
			id: generateNodeId(),
			type: "file",
			file: notePath,
			x: center.x,
			y: center.y,
			width: 400,
			height: collapsedHeight,
			metadata,
		} as any; // Use 'as any' to allow styleAttributes (Obsidian-specific field)
		
		// Add styleAttributes to align with converted nodes
		(newNode as any).styleAttributes = {};
		if (color) {
			newNode.color = color;
		}
		
		canvasData.nodes.push(newNode);
		console.log('[Canvas Plugin] Added new node:', newNode);
	}
	
	// Save the canvas file
	console.log('[Canvas Plugin] Saving canvas file...');
	await saveCanvasData(this.app, canvasFile, canvasData);
	console.log('[Canvas Plugin] Canvas file saved successfully');
	
	// Don't reload - let Obsidian detect the change and refresh automatically
	console.log('[Canvas Plugin] Letting Obsidian auto-detect canvas file change');
	
	// Keep the flag true for a bit to prevent deletion detection during auto-refresh
	setTimeout(() => {
		this.isUpdatingCanvas = false;
		console.log('[Canvas Plugin] isUpdatingCanvas set to false (delayed)');
	}, 500);
	
	console.log('[Canvas Plugin] ===== END updateCanvas =====');
	new Notice(`✅ Item created and added to canvas!`, 4000);
}

	/**
	 * Update a note with the Notion page ID
	 */
	private async updateNoteWithNotionId(notePath: string, notionPageId: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile)) {
			throw new Error("Note file not found");
		}

		const content = await this.app.vault.read(file);
		const updatedContent = updateFrontmatter(content, {
			notion_page_id: notionPageId,
			updated: new Date().toISOString(),
		});

		await this.app.vault.modify(file, updatedContent);
		await this.logger?.info("Note updated with Notion page ID", { notePath, notionPageId });
	}

	/**
	 * Check if we should sync on create
	 */
	private shouldSyncOnCreate(): boolean {
		return (
			this.settings.notionEnabled &&
			this.settings.syncOnNoteCreate &&
			!this.settings.syncOnDemandOnly &&
			!!this.settings.notionDatabaseId &&
			!!this.notionClient
		);
	}

	/**
	 * Initialize Notion database
	 */
	async initializeNotionDatabase(): Promise<void> {
		if (!this.notionClient) {
			new Notice("Notion client not initialized");
			return;
		}

		if (!this.settings.notionEnabled) {
			new Notice("Notion sync is not enabled. Enable it in settings first.");
			return;
		}

		if (!this.settings.notionIntegrationToken || !this.settings.notionParentPageId) {
			new Notice("Please configure Notion integration token and parent page ID in settings");
			return;
		}

		try {
			new Notice("Initializing Notion database...");
			const databaseId = await this.notionClient.createDatabase();
			this.settings.notionDatabaseId = databaseId;
			await this.saveSettings();
			new Notice(`Notion database created successfully! ID: ${databaseId}`);
			await this.logger?.info("Notion database initialized", { databaseId });
		} catch (error) {
			await this.logger?.error("Failed to initialize Notion database", error);
			new Notice("Failed to initialize Notion database: " + (error as Error).message);
		}
	}

	/**
	 * Sync current note to Notion
	 */
	private async syncCurrentNoteToNotion(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "md") {
			new Notice("No active markdown note");
			return;
		}

		await this.syncFileToNotion(activeFile);
	}

	/**
	 * Sync a specific file to Notion
	 */
	private async syncFileToNotion(file: TFile): Promise<void> {
		if (!this.notionClient || !this.settings.notionEnabled) {
			new Notice("Notion sync is not enabled");
			return;
		}

		if (!this.settings.notionDatabaseId) {
			new Notice("Notion database not initialized. Run 'Initialize Notion Database' first.");
			return;
		}

		try {
			// Read and parse frontmatter
			const content = await this.app.vault.read(file);
			const frontmatter = parseFrontmatter(content);

			if (!frontmatter) {
				new Notice("This note does not have valid Canvas Item frontmatter");
				return;
			}

			if (frontmatter.type !== "accomplishment") {
				new Notice("This note is not an accomplishment");
				return;
			}

			new Notice("Syncing to Notion...");

			const pageId = await this.notionClient.syncNote(frontmatter);

			// Update note with page ID if it was created
			if (!frontmatter.notion_page_id) {
				await this.updateNoteWithNotionId(file.path, pageId);
			}

			new Notice("Successfully synced to Notion");
			await this.logger?.info("Sync successful", {
				file: file.path,
				pageId,
			});
		} catch (error) {
			await this.logger?.error("Failed to sync note to Notion", error);
			new Notice("Failed to sync to Notion: " + (error as Error).message);
		}
	}

	/**
	 * Sync all notes in the current canvas to Notion
	 */
	private async syncAllCanvasNotesToNotion(): Promise<void> {
		if (!this.notionClient || !this.settings.notionEnabled) {
			new Notice("Notion sync is not enabled");
			return;
		}

		if (!this.notionClient.isDatabaseInitialized()) {
			new Notice("Notion database not initialized. Run 'Initialize Notion Database' first.");
			return;
		}

		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			new Notice("No active canvas file");
			return;
		}

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			if (!canvasData) {
				new Notice("Failed to load canvas data");
				return;
			}

			// Find all file nodes that are plugin-created accomplishments
			const fileNodes = canvasData.nodes.filter(
				(node) => node.type === "file" && node.file?.endsWith(".md")
			);

			if (fileNodes.length === 0) {
				new Notice("No markdown files found in canvas");
				return;
			}

			let syncedCount = 0;
			let skippedCount = 0;
			let errorCount = 0;

			new Notice(`Syncing ${fileNodes.length} notes to Notion...`);

			for (const node of fileNodes) {
				const file = this.app.vault.getAbstractFileByPath(node.file!);
				if (!(file instanceof TFile)) {
					skippedCount++;
					continue;
				}

				try {
					// Read frontmatter to check if it's a plugin-created accomplishment
					const content = await this.app.vault.read(file);
					const frontmatter = parseFrontmatter(content);

					if (!frontmatter || frontmatter.type !== "accomplishment" || !frontmatter.created_by_plugin) {
						skippedCount++;
						continue;
					}

					// Sync the file
					const pageId = await this.notionClient.syncNote(frontmatter);

					// Update note with page ID if it was created
					if (!frontmatter.notion_page_id) {
						await this.updateNoteWithNotionId(file.path, pageId);
					}

					syncedCount++;
				} catch (error) {
					await this.logger?.error("Failed to sync note", { file: file.path, error });
					errorCount++;
				}
			}

			const message = `Sync complete: ${syncedCount} synced, ${skippedCount} skipped, ${errorCount} errors`;
			new Notice(message);
			await this.logger?.info("Batch sync complete", { syncedCount, skippedCount, errorCount });
		} catch (error) {
			await this.logger?.error("Failed to sync canvas notes to Notion", error);
			new Notice("Failed to sync canvas notes: " + (error as Error).message);
		}
	}

	/**
	 * Ensure templates exist, creating them if necessary
	 */
	async ensureTemplatesExist(force = false): Promise<void> {
		const templates = [
			{
				path: this.settings.accomplishmentTemplatePath,
				content: DEFAULT_ACCOMPLISHMENT_TEMPLATE,
				name: "Accomplishment",
			},
		];

		for (const template of templates) {
			const normalizedPath = normalizePath(template.path);
			const exists = await this.app.vault.adapter.exists(normalizedPath);

			if (!exists || force) {
				// Ensure parent folder exists
				const lastSlash = normalizedPath.lastIndexOf("/");
				if (lastSlash > 0) {
					const folder = normalizedPath.substring(0, lastSlash);
					await this.ensureFolderExists(folder);
				}

				// Create or overwrite template
				const file = this.app.vault.getAbstractFileByPath(normalizedPath);
				if (file instanceof TFile) {
					await this.app.vault.modify(file, template.content);
					await this.logger?.info("Template regenerated", { path: normalizedPath });
				} else {
					await this.app.vault.create(normalizedPath, template.content);
					await this.logger?.info("Template created", { path: normalizedPath });
				}

				if (!exists) {
					new Notice(`${template.name} template created at ${normalizedPath}`);
				}
			}
		}
	}

	/**
	 * Add context menu items for canvas files (file explorer)
	 * Currently empty - creation via right-click menu has been removed
	 */
	private addCanvasContextMenu(_menu: Menu, _canvasFile: TFile): void {
		// Canvas context menu items removed - use text node conversion instead
	}

	/**
	 * Add context menu items for note files (editor menu)
	 */
	private addNoteContextMenu(menu: Menu, file: TFile): void {
		menu.addItem((item: MenuItem) => {
			item
				.setTitle("Convert to Structured Item")
				.setIcon("file-box")
				.onClick(async () => {
					await this.convertNoteToStructuredItem(file);
				});
		});
	}

	/**
	 * Add a selection overlay button to convert text nodes without right-click
	 */
	private setupCanvasSelectionButton(): void {
		console.log("[Canvas Plugin] Setting up selection watcher");
		// Periodically check selection to keep buttons in sync
		const interval = window.setInterval(() => this.syncSelectionButtons(), 400);
		this.registerInterval(interval);

		// Also react quickly to clicks/keypresses that change selection
		this.registerDomEvent(document, "click", () => this.syncSelectionButtons());
		this.registerDomEvent(document, "keydown", () => this.syncSelectionButtons());
	}

	// Track which nodes have had menu buttons injected to avoid repeated calls
	private menuButtonsInjectedFor: Set<string> = new Set();

	private syncSelectionButtons(): void {
		const selectedNodes = this.getSelectedCanvasNodeElements();
		const seenIds = new Set<string>();

		for (const nodeEl of selectedNodes) {
			const canvasNode = this.findCanvasNodeByElement(nodeEl);
			const data = canvasNode?.getData?.();
			const nodeId = data?.id;
			if (!nodeId) continue;
			seenIds.add(nodeId);

			// Check type from file (async) - but don't block the loop
			// We'll create button asynchronously if it's a text node
			if (this.selectionButtons.has(nodeId)) continue;

			// Create button asynchronously (reads from file to check type)
			this.createSelectionButton(nodeEl, canvasNode).then(button => {
				if (button) {
					this.selectionButtons.set(nodeId, button);
				}
			}).catch(err => {
				console.error("[Canvas Plugin] Failed to create selection button:", err);
			});

			// Track for menu injection - only inject if not already done for this node
			this.lastSelectedMenuNode = canvasNode;
			if (!this.menuButtonsInjectedFor.has(nodeId)) {
				this.menuButtonsInjectedFor.add(nodeId);
				this.addSelectionMenuButton(canvasNode).catch(err =>
					console.error("[Canvas Plugin] Failed to add selection menu button:", err)
				);
			}
		}

		// Remove buttons for nodes no longer selected
		for (const [id, btn] of this.selectionButtons.entries()) {
			if (!seenIds.has(id)) {
				btn.remove();
				this.selectionButtons.delete(id);
			}
		}

		// Clear menu button tracking for deselected nodes
		for (const id of this.menuButtonsInjectedFor) {
			if (!seenIds.has(id)) {
				this.menuButtonsInjectedFor.delete(id);
			}
		}

		// If nothing selected, clear last reference and menu tracking
		if (seenIds.size === 0) {
			this.lastSelectedMenuNode = null;
			this.menuButtonsInjectedFor.clear();
		}
	}

	private async createSelectionButton(nodeEl: HTMLElement, canvasNode: any): Promise<HTMLElement | null> {
		try {
			// Get node ID from getData() to locate node in file
			const data = canvasNode?.getData?.();
			if (!data?.id) return null;

			// Read node type from canvas file (source of truth)
			if (!canvasNode?.canvas?.view?.file) {
				return null;
			}

			let nodeInFile: CanvasNode | undefined;
			try {
				const canvasFile = canvasNode.canvas.view.file;
				const canvasData = await loadCanvasData(this.app, canvasFile);
				nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === data.id);
				
				if (!nodeInFile) {
					return null;
				}
			} catch (err) {
				console.error("[Canvas Plugin] Failed to read from canvas file:", err);
				return null;
			}

			// Only show button for text nodes
			if (nodeInFile.type !== "text") {
				return null;
			}

			// Avoid duplicates
			if (nodeEl.querySelector(".canvas-structured-items-select-btn")) {
				return null;
			}

			const btn = document.createElement("button");
			btn.className = "canvas-structured-items-select-btn";
			btn.textContent = "Convert";
			btn.style.position = "absolute";
			btn.style.right = "8px";
			btn.style.bottom = "8px";
			btn.style.padding = "6px 10px";
			btn.style.borderRadius = "6px";
			btn.style.border = "1px solid var(--background-modifier-border)";
			btn.style.background = "var(--background-secondary, #f2f3f5)";
			btn.style.color = "var(--text-normal)";
			btn.style.cursor = "pointer";
			btn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.08)";
			btn.style.zIndex = "9999";

			// Ensure nodeEl can host absolutely-positioned child
			if (getComputedStyle(nodeEl).position === "static") {
				nodeEl.style.position = "relative";
			}
			nodeEl.style.overflow = "visible";

			btn.addEventListener("click", async (e) => {
				e.preventDefault();
				e.stopPropagation();
				console.log("[Canvas Plugin] Selection button clicked for node", data?.id);
				await this.convertCanvasNodeToStructuredItem(canvasNode);
			});

			nodeEl.appendChild(btn);
			return btn;
		} catch (error) {
			console.error("[Canvas Plugin] Failed to create selection button", error);
			return null;
		}
	}

	private removeSelectionButton(nodeId: string): void {
		const btn = this.selectionButtons.get(nodeId);
		if (btn) {
			btn.remove();
			this.selectionButtons.delete(nodeId);
		}
	}

	/**
	 * Log clicks on text nodes to help diagnose selection/menu issues
	 */
	private setupCanvasClickLogger(): void {
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const wrapped = this.getCanvasNodeFromEventTarget(evt.target);
			if (!wrapped) {
				if (this.isResizing) {
					// Ignore outside click immediately after resize
					console.log("[Canvas Plugin] Outside click ignored because isResizing=true");
					this.isResizing = false;
					return;
				}
				console.log("[Canvas Plugin] Click outside canvas node");
				this.clearInjectedMenuButtons();
				return;
			}

			const canvasNode = wrapped.node;
			const data = canvasNode?.getData?.();
			if (!data) return;

			console.log("[Canvas Plugin] Canvas node clicked", {
				id: data.id,
				type: data.type,
				file: data.file,
				textPreview: data.text ? (data.text as string).split("\n")[0]?.slice(0, 80) : undefined,
				metadataPlugin: data.metadata?.plugin,
			});

			// Remember last selected node and inject appropriate menu button
			this.lastSelectedMenuNode = canvasNode;
			this.addSelectionMenuButton(canvasNode).catch(err => 
				console.error("[Canvas Plugin] Failed to inject menu button on click", err)
			);
		});

		// Track size on pointer down for resize detection
		this.registerDomEvent(document, "mousedown", (evt: MouseEvent) => {
			const wrapped = this.getCanvasNodeFromEventTarget(evt.target);
			if (!wrapped) return;
			const canvasNode = wrapped.node;
			const data = canvasNode?.getData?.();
			if (!data) return;
			this.lastPointerNodeSize = {
				id: data.id,
				width: data.width,
				height: data.height,
				ref: canvasNode,
				el: wrapped.el,
			};
		});

		// Detect size change on mouseup
		this.registerDomEvent(document, "mouseup", () => {
			if (!this.lastPointerNodeSize) return;
			const { id, width: oldW, height: oldH, ref, el } = this.lastPointerNodeSize;
			setTimeout(() => {
				if (this.isResizing) {
					console.log("[Canvas Plugin] isResizing -> false (mouseup)");
				}
				this.isResizing = false;
				const latest = ref?.getData?.();
				let newW = latest?.width;
				let newH = latest?.height;

				// Fallback: read from element inline style/bounding box
				if (el && el.isConnected) {
					const styleW = parseFloat(el.style.width || "");
					const styleH = parseFloat(el.style.height || "");
					if (!isNaN(styleW)) newW = newW ?? styleW;
					if (!isNaN(styleH)) newH = newH ?? styleH;
					if (newW === undefined || newH === undefined) {
						const rect = el.getBoundingClientRect();
						newW = newW ?? rect.width;
						newH = newH ?? rect.height;
					}
				}

				if (
					newW !== undefined &&
					newH !== undefined &&
					(newW !== oldW || newH !== oldH)
				) {
					console.log("[Canvas Plugin] Node resized", {
						id,
						oldWidth: oldW,
						oldHeight: oldH,
						newWidth: newW,
						newHeight: newH,
					});
				}
				this.lastPointerNodeSize = null;
			}, 0);
		});

		// Live mousemove tracking while resizing
		this.registerDomEvent(document, "mousemove", () => {
			if (!this.isResizing || !this.lastPointerNodeSize) return;
			const { id, ref, el, width: prevW, height: prevH } = this.lastPointerNodeSize;
			if (!el || !el.isConnected) return;

			const latest = ref?.getData?.();
			let newW = latest?.width;
			let newH = latest?.height;

			const styleW = parseFloat(el.style.width || "");
			const styleH = parseFloat(el.style.height || "");
			if (!isNaN(styleW)) newW = newW ?? styleW;
			if (!isNaN(styleH)) newH = newH ?? styleH;
			if (newW === undefined || newH === undefined) {
				const rect = el.getBoundingClientRect();
				newW = newW ?? rect.width;
				newH = newH ?? rect.height;
			}

			if (
				newW !== undefined &&
				newH !== undefined &&
				(newW !== prevW || newH !== prevH)
			) {
				if (!this.isResizing) {
					this.isResizing = true;
					console.log("[Canvas Plugin] isResizing -> true (detected size change)");
				}
				console.log("[Canvas Plugin] Node resizing (mousemove)", {
					id,
					oldWidth: prevW,
					oldHeight: prevH,
					newWidth: newW,
					newHeight: newH,
				});
				this.lastPointerNodeSize.width = newW;
				this.lastPointerNodeSize.height = newH;
				this.persistSizeOnResize(latest?.file, latest?.metadata?.collapsed, newW, newH);
			}
		});
	}

	private clearInjectedMenuButtons(): void {
		const menus = document.querySelectorAll<HTMLElement>(".canvas-card-menu");
		menus.forEach((menu) => {
			menu
				.querySelectorAll(
					".canvas-structured-items-select-menu, .canvas-structured-items-collapse-menu, .canvas-structured-items-open-menu"
				)
				.forEach((el) => el.remove());
		});
	}

	private getSelectedCanvasNodeElements(): HTMLElement[] {
		const selectors = [
			".canvas-node.is-selected",
			".canvas-card.is-selected",
			".canvas-node.selected",
			".canvas-card.selected",
		];
		const elems: HTMLElement[] = [];
		for (const selector of selectors) {
			const found = document.querySelectorAll<HTMLElement>(selector);
			found.forEach((el) => elems.push(el));
		}
		return elems;
	}

	/**
	 * Inject a convert button into the selection toolbar (canvas-card-menu) for text nodes
	 */
	private async addSelectionMenuButton(canvasNode: any): Promise<void> {
		try {
			// Get node ID from getData() - we need this to locate the node in the file
			const data = canvasNode?.getData?.();
			if (!data || !data.id) {
				console.log("[Canvas Plugin] No data found for node");
				return;
			}

			// Read ALL node data from canvas file (source of truth)
			// getData() may be stale, especially after conversions
			let nodeInFile: CanvasNode | undefined;
			if (!canvasNode?.canvas?.view?.file) {
				console.log("[Canvas Plugin] Cannot access canvas file");
				return;
			}

			try {
				const canvasFile = canvasNode.canvas.view.file;
				const canvasData = await loadCanvasData(this.app, canvasFile);
				nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === data.id);
				
				if (!nodeInFile) {
					console.log("[Canvas Plugin] Node not found in canvas file:", data.id);
					return;
				}
			} catch (err) {
				console.error("[Canvas Plugin] Failed to read from canvas file:", err);
				return;
			}

			// Use all fields from file (source of truth)
			const nodeType = nodeInFile.type;
			const metadata = nodeInFile.metadata;
			const filePath = nodeInFile.file;

			console.log("[Canvas Plugin] Determining mode for node:", {
				id: nodeInFile.id,
				type: nodeType,
				hasMetadata: !!metadata,
				plugin: metadata?.plugin,
			});

			// Determine which button to inject based on node type
			let mode: "convert" | "collapse" | null = null;
			if (nodeType === "text") {
				mode = "convert";
			} else if (nodeType === "file") {
				// Only show collapse/expand for plugin-created notes
				if (metadata?.plugin === "structured-canvas-notes") {
					mode = "collapse";
				} else {
					// Regular file node, don't show any buttons
					console.log("[Canvas Plugin] File node is not plugin-created, skipping");
					return;
				}
			}
			
			if (!mode) {
				console.log("[Canvas Plugin] No mode determined for node type:", data.type);
				return;
			}

			const menus = document.querySelectorAll<HTMLElement>(".canvas-card-menu");
			let visibleMenu: HTMLElement | null = null;
			for (let i = 0; i < menus.length; i++) {
				const el = menus[i] as HTMLElement;
				const style = window.getComputedStyle(el);
				if (style.display !== "none" && style.visibility !== "hidden") {
					visibleMenu = el;
					break;
				}
			}

			if (!visibleMenu) {
				console.log("[Canvas Plugin] No visible selection menu found for node", nodeInFile.id);
				return;
			}

			// Remove previous injected buttons to avoid stale callbacks or duplicates
			visibleMenu
				.querySelectorAll(
					".canvas-structured-items-select-menu, .canvas-structured-items-collapse-menu, .canvas-structured-items-open-menu"
				)
				.forEach((el) => el.remove());

			console.log("[Canvas Plugin] Injecting selection menu buttons for node", nodeInFile.id, "mode", mode);

			if (mode === "convert") {
				const convertButton = this.buildMenuButton(
					"canvas-structured-items-select-menu",
					"Convert",
					async () => this.convertCanvasNodeToStructuredItem(canvasNode),
					canvasNode
				);
				visibleMenu.appendChild(convertButton);
			} else if (mode === "collapse" && metadata?.plugin === "structured-canvas-notes") {
				// Use file path from canvas file (source of truth)
				const openButton = this.buildMenuButton(
					"canvas-structured-items-open-menu",
					"Open",
					async () => this.openAllSelectedFileNodes(),
					canvasNode
				);
				visibleMenu.appendChild(openButton);

				const isCollapsed = !!metadata?.collapsed;
				const collapseLabel = isCollapsed ? "Expand" : "Collapse";
				const collapseButton = this.buildMenuButton(
					"canvas-structured-items-collapse-menu",
					collapseLabel,
					async () => {
						// Always read from file to get latest state
						if (!canvasNode?.canvas?.view?.file) return;
						
						try {
							// Get node ID to locate it in the file
							const data = canvasNode?.getData?.();
							if (!data?.id) return;
							
							const canvasFile = canvasNode.canvas.view.file;
							const canvasData = await loadCanvasData(this.app, canvasFile);
							const latestNodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === data.id);
							const currentlyCollapsed = !!latestNodeInFile?.metadata?.collapsed;
							await this.toggleNodeCollapsedState(canvasNode, !currentlyCollapsed);
						} catch (err) {
							console.error("[Canvas Plugin] Failed to read latest state from file:", err);
						}
					},
					canvasNode
				);
				visibleMenu.appendChild(collapseButton);
			}
		} catch (error) {
			console.error("[Canvas Plugin] Failed to add selection menu button", error);
		}
	}

	private buildMenuButton(
		className: string,
		labelText: string,
		onClick: () => void | Promise<void>,
		canvasNode: any
	): HTMLElement {
		const item = document.createElement("div");
		item.className = `${className} clickable-icon`;
		item.style.display = "flex";
		item.style.alignItems = "center";
		item.style.gap = "6px";
		item.style.cursor = "pointer";

		const iconDiv = document.createElement("div");
		iconDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M14.5 22H18a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path>
			<polyline points="14 2 14 8 20 8"></polyline>
			<circle cx="7" cy="14" r="3"></circle>
		</svg>`;
		item.appendChild(iconDiv);

		const label = document.createElement("span");
		label.textContent = labelText;
		item.appendChild(label);

		item.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			await onClick();
			// Rebuild menu immediately to refresh labels (e.g., Collapse/Expand)
			await this.addSelectionMenuButton(canvasNode);
		});

		return item;
	}

	private async openCanvasFileNode(filePath?: string): Promise<void> {
		try {
			if (!filePath) {
				console.log("[Canvas Plugin] No file path to open");
				return;
			}
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				console.log("[Canvas Plugin] File not found", filePath);
				return;
			}
			const workspace = this.app.workspace;
			const existingLeaf = workspace.getLeavesOfType("markdown").find((leaf) => {
				const view = leaf.view as any;
				return view.file?.path === file.path;
			});

			if (existingLeaf) {
				await workspace.revealLeaf(existingLeaf);
			} else {
				await workspace.getLeaf(true).openFile(file);
			}
		} catch (error) {
			console.error("[Canvas Plugin] Failed to open file from canvas node", error);
		}
	}

	/**
	 * Open all selected file nodes in separate tabs
	 */
	private async openAllSelectedFileNodes(): Promise<void> {
		try {
			const selectedNodes = this.getSelectedCanvasNodeElements();
			const filePaths: string[] = [];

			// Collect file paths from all selected nodes
			for (const nodeEl of selectedNodes) {
				const canvasNode = this.findCanvasNodeByElement(nodeEl);
				const data = canvasNode?.getData?.();
				if (!data?.id || !canvasNode?.canvas?.view?.file) continue;

				try {
					const canvasFile = canvasNode.canvas.view.file;
					const canvasData = await loadCanvasData(this.app, canvasFile);
					const nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === data.id);

					// Only include plugin-created file nodes
					if (nodeInFile?.type === "file" &&
						nodeInFile?.metadata?.plugin === "structured-canvas-notes" &&
						nodeInFile?.file) {
						filePaths.push(nodeInFile.file);
					}
				} catch (err) {
					console.error("[Canvas Plugin] Failed to read node from canvas file:", err);
				}
			}

			console.log("[Canvas Plugin] Opening", filePaths.length, "files in separate tabs");

			// Open each file in a new tab
			for (const filePath of filePaths) {
				await this.openCanvasFileNode(filePath);
			}
		} catch (error) {
			console.error("[Canvas Plugin] Failed to open selected file nodes", error);
		}
	}

	private async toggleCollapseFromMenu(canvasNode: any): Promise<void> {
		try {
			const data = canvasNode?.getData?.();
			if (!data) return;
			console.log("[Canvas Plugin] Collapse/expand clicked for node", data.id);
			const collapsed = !!data.metadata?.collapsed;
			await this.toggleNodeCollapsedState(canvasNode, !collapsed);
		} catch (error) {
			console.error("[Canvas Plugin] Failed to toggle collapse from menu", error);
		}
	}

	private async toggleNodeCollapsedState(canvasNode: any, collapsed: boolean): Promise<void> {
		const data = canvasNode?.getData?.();
		const canvasFile = canvasNode?.canvas?.view?.file;
		if (!data || !canvasFile) {
			console.log("[Canvas Plugin] toggleNodeCollapsedState missing data or canvasFile");
			return;
		}

		const nodeId = data.id;
		this.isUpdatingCanvas = true;

		const sizeConfig = await this.getSizeConfigForFile(data.file);

		// Update in-memory data and sizing
		if (!data.metadata) data.metadata = {};
		if (collapsed) {
			// persist expanded size from current state
			await this.persistSizeFields(data.file, {
				expanded_height: data.height,
				expanded_width: data.width,
			});
			data.metadata.expandedSize = { width: data.width, height: data.height };
			data.height = sizeConfig.collapsedHeight;
			console.log("[Canvas Plugin] Resize (memory) collapsed", {
				nodeId,
				width: data.width,
				height: data.height,
				source: "collapsed-height-setting",
			});
		} else {
			const restore = data.metadata.expandedSize;
			// persist collapsed size from current state before expanding
			await this.persistSizeFields(data.file, {
				collapsed_height: data.height,
			});
			data.height = restore?.height ?? sizeConfig.expandedHeight;
			if (restore?.width) {
				data.width = restore.width;
			} else if (sizeConfig.expandedWidth) {
				data.width = sizeConfig.expandedWidth;
			}
			console.log("[Canvas Plugin] Resize (memory) expanded", {
				nodeId,
				width: data.width,
				height: data.height,
				source: restore ? "expandedSize" : "frontmatter/default",
			});
		}
		data.metadata.collapsed = collapsed;

		try {
			// Update on-disk canvas JSON
			const canvasData = await loadCanvasData(this.app, canvasFile);
			const node = findNodeById(canvasData, nodeId);
			if (node) {
				if (!node.metadata) node.metadata = {};
				if (collapsed) {
					await this.persistSizeFields(node.file, {
						expanded_height: node.height,
						expanded_width: node.width,
					});
					node.metadata.expandedSize = { width: node.width, height: node.height };
					node.height = sizeConfig.collapsedHeight;
					console.log("[Canvas Plugin] Resize (persisted) collapsed", {
						nodeId,
						width: node.width,
						height: node.height,
						source: "collapsed-height-setting",
					});
				} else {
					const restore = node.metadata.expandedSize;
					await this.persistSizeFields(node.file, {
						collapsed_height: node.height,
					});
					node.height = restore?.height ?? sizeConfig.expandedHeight;
					if (restore?.width) {
						node.width = restore.width;
					} else if (sizeConfig.expandedWidth) {
						node.width = sizeConfig.expandedWidth;
					}
					console.log("[Canvas Plugin] Resize (persisted) expanded", {
						nodeId,
						width: node.width,
						height: node.height,
						source: restore ? "expandedSize" : "frontmatter/default",
					});
				}
				node.metadata.collapsed = collapsed;
				await saveCanvasData(this.app, canvasFile, canvasData);
				console.log("[Canvas Plugin] Saved collapsed state for node", nodeId, collapsed);
			}

			// Refresh view lightly
			const leaf = this.app.workspace
				.getLeavesOfType("canvas")
				.find((l) => (l.view as any)?.file?.path === canvasFile.path);
			const view = leaf?.view as any;
			if (view?.canvas?.requestFrame) {
				view.canvas.requestFrame();
			}
		} catch (error) {
			console.error("[Canvas Plugin] Failed to persist collapsed state", error);
		} finally {
			setTimeout(() => (this.isUpdatingCanvas = false), 300);
		}
	}

	private async getSizeConfigForFile(filePath?: string): Promise<{
		collapsedHeight: number;
		expandedHeight: number;
		expandedWidth?: number;
	}> {
		const defaults = {
			collapsedHeight: COLLAPSED_HEIGHT_DEFAULT,
			expandedHeight: EXPANDED_HEIGHT_DEFAULT,
			expandedWidth: EXPANDED_WIDTH_DEFAULT as number | undefined,
		};
		if (!filePath) return defaults;

		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) return defaults;
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter as any;
			if (!fm) return defaults;

			const collapsedHeight = Number(fm.collapsed_height);
			const expandedHeight = Number(fm.expanded_height);
			const expandedWidth = fm.expanded_width !== undefined ? Number(fm.expanded_width) : undefined;

			return {
				collapsedHeight: !isNaN(collapsedHeight) && collapsedHeight > 0 ? collapsedHeight : defaults.collapsedHeight,
				expandedHeight: !isNaN(expandedHeight) && expandedHeight > 0 ? expandedHeight : defaults.expandedHeight,
				expandedWidth: !isNaN(expandedWidth || NaN) && expandedWidth! > 0 ? expandedWidth : undefined,
			};
		} catch {
			return defaults;
		}
	}

	private async getCollapsedHeightForFile(filePath: string): Promise<number> {
		const config = await this.getSizeConfigForFile(filePath);
		return config.collapsedHeight;
	}

	private async persistSizeFields(
		filePath: string | undefined,
		fields: Partial<Pick<ItemFrontmatter, "collapsed_height" | "expanded_height" | "expanded_width">>
	): Promise<void> {
		if (!filePath) return;
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;
		try {
			const content = await this.app.vault.read(file);
			const updated = updateFrontmatter(content, fields as any);
			await this.app.vault.modify(file, updated);
		} catch (error) {
			console.error("[Canvas Plugin] Failed to persist size fields", error);
		}
	}

	private persistSizeOnResize(
		filePath: string | undefined,
		collapsed: boolean | undefined,
		width: number,
		height: number
	): void {
		if (!filePath) return;
		const fields: Partial<ItemFrontmatter> = {};
		if (collapsed) {
			fields.collapsed_height = height;
		} else {
			fields.expanded_height = height;
			fields.expanded_width = width;
		}
		void this.persistSizeFields(filePath, fields);
	}

	private getSelectedCanvasTextNode(): any | null {
		const selectedEls = this.getSelectedCanvasNodeElements();
		for (const el of selectedEls) {
			const node = this.findCanvasNodeByElement(el);
			const data = node?.getData?.();
			if (data?.type === "text") {
				return node;
			}
		}
		return null;
	}

	private getSelectedCanvasFileNode(): any | null {
		const selectedEls = this.getSelectedCanvasNodeElements();
		for (const el of selectedEls) {
			const node = this.findCanvasNodeByElement(el);
			const data = node?.getData?.();
			if (data?.type === "file") {
				return node;
			}
		}
		return null;
	}

	private async convertCurrentlySelectedTextNode(): Promise<void> {
		const node = this.getSelectedCanvasTextNode();
		if (!node) {
			console.log("[Canvas Plugin] No selected text node to convert");
			return;
		}
		await this.convertCanvasNodeToStructuredItem(node);
	}

	private async toggleCurrentlySelectedCollapse(): Promise<void> {
		const node = this.getSelectedCanvasFileNode();
		if (!node || !node.canvas?.view?.file) {
			console.log("[Canvas Plugin] No eligible file node for collapse toggle");
			return;
		}

		// Get node ID from getData() to locate node in file
		const data = node.getData?.();
		if (!data?.id) {
			return;
		}

		// Read metadata from canvas file (source of truth)
		try {
			const canvasFile = node.canvas.view.file;
			const canvasData = await loadCanvasData(this.app, canvasFile);
			const nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === data.id);
			
			if (!nodeInFile || nodeInFile.metadata?.plugin !== "structured-canvas-notes") {
				console.log("[Canvas Plugin] Node is not plugin-created");
				return;
			}

			const collapsed = !!nodeInFile.metadata?.collapsed;
			await this.toggleNodeCollapsedState(node, !collapsed);
		} catch (err) {
			console.error("[Canvas Plugin] Failed to read from canvas file:", err);
		}
	}

	/**
	 * Setup canvas node context menu using DOM events
	 */
	private setupCanvasNodeContextMenu(): void {
		// Store current node for menu actions
		let currentContextNode: any = null;
		
		// Use contextmenu event on document to catch all right-clicks
		this.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
			// Check if click is on a canvas node
			const target = evt.target as HTMLElement;
			const nodeEl = target.closest('.canvas-node') as HTMLElement;
			
			if (nodeEl) {
				console.log('[Canvas Plugin] Right-click detected on canvas node');
				
				// Find and store the actual node object
				currentContextNode = this.findCanvasNodeByElement(nodeEl);
				
				if (!currentContextNode) {
					console.log('[Canvas Plugin] Could not find node object');
					return;
				}
				
				console.log('[Canvas Plugin] Stored node reference:', currentContextNode.id);
				
				// Wait for menu to appear, then add our item
				setTimeout(() => this.addCanvasNodeMenuItemToDOM(currentContextNode).catch(err => 
					console.error('[Canvas Plugin] Failed to add menu item:', err)
				), 50);
				setTimeout(() => this.addCanvasNodeMenuItemToDOM(currentContextNode).catch(err => 
					console.error('[Canvas Plugin] Failed to add menu item:', err)
				), 100);
			}
		});

		console.log('[Canvas Plugin] Canvas node context menu setup complete');
	}

	/**
	 * Find canvas node object by its DOM element
	 */
	private findCanvasNodeByElement(nodeEl: HTMLElement): any {
		const leaves = this.app.workspace.getLeavesOfType("canvas");
		
		for (const leaf of leaves) {
			const canvasView = leaf.view as any;
			const canvas = canvasView?.canvas;
			if (!canvas) continue;

			// Find the node by its element
			for (const node of canvas.nodes.values()) {
				if (node.nodeEl === nodeEl) {
					return node;
				}
			}
		}
		
		return null;
	}

	/**
	 * Add our menu item to the DOM menu
	 */
	private async addCanvasNodeMenuItemToDOM(targetNode: any): Promise<void> {
		try {
			// Find the visible canvas menu
			let menuEl: HTMLElement | null = null;
			
			const menus = document.querySelectorAll('.canvas-card-menu');
			for (let i = 0; i < menus.length; i++) {
				const el = menus[i] as HTMLElement;
				const style = window.getComputedStyle(el);
				if (style.display !== 'none' && style.visibility !== 'hidden') {
					menuEl = el;
					break;
				}
			}

			if (!menuEl) {
				console.log('[Canvas Plugin] No visible canvas-card-menu found');
				return;
			}

			// Check if we already added our item to THIS menu
			if (menuEl.querySelector('.canvas-structured-items-convert')) {
				console.log('[Canvas Plugin] Menu item already exists in this menu');
				return;
			}

			// Get node ID from getData() to locate node in file
			const nodeData = targetNode.getData?.();
			if (!nodeData?.id) {
				console.log('[Canvas Plugin] No node ID found');
				return;
			}

			// Read node type from canvas file (source of truth)
			if (!targetNode?.canvas?.view?.file) {
				console.log('[Canvas Plugin] Cannot access canvas file');
				return;
			}

			let nodeInFile: CanvasNode | undefined;
			try {
				const canvasFile = targetNode.canvas.view.file;
				const canvasData = await loadCanvasData(this.app, canvasFile);
				nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === nodeData.id);
				
				if (!nodeInFile) {
					console.log('[Canvas Plugin] Node not found in canvas file:', nodeData.id);
					return;
				}
			} catch (err) {
				console.error('[Canvas Plugin] Failed to read from canvas file:', err);
				return;
			}

			// Only show menu item for text nodes
			if (nodeInFile.type !== "text") {
				console.log('[Canvas Plugin] Not a text node, type:', nodeInFile.type);
				return;
			}

			console.log('[Canvas Plugin] Adding menu item for text node:', nodeInFile.id);

			// Find existing menu items to match their style
			const existingItems = menuEl.querySelectorAll('div[class*="clickable"]');
			let itemClass = 'clickable-icon';
			if (existingItems.length > 0) {
				itemClass = (existingItems[0] as HTMLElement).className;
			}

			// Create our menu item matching Obsidian's style
			const item = document.createElement('div');
			item.className = itemClass + ' canvas-structured-items-convert';
			
			// Copy styles from first existing item if available
			if (existingItems.length > 0) {
				const referenceItem = existingItems[0] as HTMLElement;
				const computedStyle = window.getComputedStyle(referenceItem);
				item.style.cssText = `
					padding: ${computedStyle.padding};
					cursor: pointer;
					display: ${computedStyle.display};
					align-items: ${computedStyle.alignItems};
					gap: ${computedStyle.gap};
					font-size: ${computedStyle.fontSize};
					color: ${computedStyle.color};
				`;
			}
			
			item.setAttribute('aria-label', 'Convert to Structured Item');
			
			// Create icon
			const iconDiv = document.createElement('div');
			iconDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14.5 22H18a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<circle cx="7" cy="14" r="3"></circle>
			</svg>`;
			
			item.appendChild(iconDiv);
			
			// Add click handler with the correct node reference
			item.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				
				console.log('[Canvas Plugin] Menu item clicked, converting node:', targetNode.id);
				
				// Close the menu
				menuEl!.style.display = 'none';
				
				// Convert the node (use the captured targetNode, not a lookup)
				await this.convertCanvasNodeToStructuredItem(targetNode);
			});
			
			// Add to menu
			menuEl.appendChild(item);

			console.log('[Canvas Plugin] Added context menu item');
		} catch (error) {
			console.error('[Canvas Plugin] Failed to add context menu item:', error);
		}
	}

	/**
	 * Convert an existing note to a structured item
	 */
	private async convertNoteToStructuredItem(file: TFile): Promise<void> {
		try {
			await this.logger?.info("Conversion flow invoked (note to structured item)", {
				path: file.path,
			});
			const content = await this.app.vault.read(file);
			const { frontmatter, body } = parseFrontmatterAndBody(content);

		// Show modal to get item details
		const fileNameWithoutExt = file.basename;
		const modalOptions: StructuredItemModalOptions = {
			showTitleInput: false,
			showAliasInput: true,
			showCollapsedToggle: false,
			showTemplateSelector: false,
			typeEditable: true,
			modalTitle: "Convert to Structured Item",
			submitButtonText: "Convert",
			currentTitle: fileNameWithoutExt,
		};
		const modal = new StructuredItemModal(
			this.app,
			this.settings,
			modalOptions,
			async (result) => {
				// Map StructuredItemResult to ConvertNoteResult
				const convertResult: ConvertNoteResult = {
					type: result.type,
					effort: result.effort,
					alias: result.alias,
				};
				await this.performNoteConversion(file, convertResult, frontmatter, body);
			}
		);
		modal.open();
		} catch (error) {
			await this.logger?.error("Failed to convert note", error);
			new Notice("Failed to convert note: " + (error as Error).message);
		}
	}

	/**
	 * Perform the actual note conversion
	 */
	private async performNoteConversion(
		file: TFile,
		result: ConvertNoteResult,
		existingFrontmatter: any,
		body: string
	): Promise<void> {
		try {
			// Generate ID
			const id = await generateId(this.app, this.settings);

			// Keep the same file path
			const newPath = file.path;

			// Create new frontmatter (merge with existing)
			const now = new Date().toISOString();
			const newFrontmatter: ItemFrontmatter = {
				...existingFrontmatter, // Keep existing fields
				type: result.type,
				title: file.basename,
				effort: result.effort,
				id,
				status: this.normalizeStatus(existingFrontmatter.status),
				priority: this.normalizePriority(
					existingFrontmatter.priority || (result.type === "accomplishment" ? "High" : "Medium")
				),
				created_by_plugin: existingFrontmatter.created_by_plugin ?? true,
				created: existingFrontmatter.created || now,
				updated: now,
				canvas_source: existingFrontmatter.canvas_source || "",
				collapsed_height: existingFrontmatter.collapsed_height ?? COLLAPSED_HEIGHT_DEFAULT,
				expanded_height: existingFrontmatter.expanded_height ?? EXPANDED_HEIGHT_DEFAULT,
				expanded_width: existingFrontmatter.expanded_width ?? EXPANDED_WIDTH_DEFAULT,
			};

			// Update note content
			const newContent = createWithFrontmatter(body, newFrontmatter);

			// Update content
			await this.app.vault.modify(file, newContent);

			new Notice(`✅ Converted to ${result.type}: ${id}`);
			await this.logger?.info("Note converted", { oldPath: file.path, newPath, id });

			// Sync to Notion if enabled
			if (this.shouldSyncOnCreate()) {
				const updatedFile = this.app.vault.getAbstractFileByPath(newPath);
				if (updatedFile instanceof TFile) {
					await this.syncFileToNotion(updatedFile);
				}
			}
		} catch (error) {
			await this.logger?.error("Failed to perform note conversion", error);
			new Notice("Failed to convert note: " + (error as Error).message);
		}
	}

	/**
	 * Convert a canvas text node to a structured item file
	 */
	private async convertCanvasNodeToStructuredItem(node: any): Promise<void> {
		try {
			// Get node ID from getData() - we need this to locate the node in the file
			const nodeData = node.getData();
			if (!nodeData?.id) {
				console.log('[Canvas Plugin] No node ID found');
				return;
			}

			const canvasView = node.canvas?.view;
			const canvasFile = canvasView?.file;

			if (!canvasFile) {
				new Notice("Could not find canvas file");
				return;
			}

			// Read node data from canvas file (source of truth)
			let nodeInFile: CanvasNode | undefined;
			try {
				const canvasData = await loadCanvasData(this.app, canvasFile);
				nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === nodeData.id);
				
				if (!nodeInFile) {
					console.log('[Canvas Plugin] Node not found in canvas file:', nodeData.id);
					return;
				}
			} catch (err) {
				console.error('[Canvas Plugin] Failed to read from canvas file:', err);
				return;
			}

			console.log('[Canvas Plugin] convertCanvasNodeToStructuredItem called for node:', {
				id: nodeInFile.id,
				type: nodeInFile.type,
				hasMetadata: !!nodeInFile.metadata,
				plugin: nodeInFile.metadata?.plugin,
			});
			
			// Check if node is already converted (using data from file)
			if (nodeInFile.type === "file" && nodeInFile.metadata?.plugin === "structured-canvas-notes") {
				console.log('[Canvas Plugin] Node is already converted, skipping conversion');
				new Notice("This note is already a structured item");
				return;
			}
			
			// Only allow conversion of text nodes
			if (nodeInFile.type !== "text") {
				console.log('[Canvas Plugin] Node is not a text node, cannot convert:', nodeInFile.type);
				new Notice("Only text nodes can be converted to structured items");
				return;
			}
			
			await this.logger?.info("Conversion flow invoked (canvas text node to structured item)", {
				nodeId: nodeInFile.id,
			});

		// Get node text as title (from file)
		const nodeText = nodeInFile.text || "Untitled";
		const title = nodeText.split('\n')[0].substring(0, 100); // First line, max 100 chars

		// Show modal to get item details
		const modalOptions: StructuredItemModalOptions = {
			showTitleInput: false,
			showAliasInput: true,
			showCollapsedToggle: false,
			showTemplateSelector: false,
			typeEditable: true,
			modalTitle: "Convert to Structured Item",
			submitButtonText: "Convert",
			currentTitle: title,
		};
		const modal = new StructuredItemModal(
			this.app,
			this.settings,
			modalOptions,
			async (result) => {
				// Map StructuredItemResult to ConvertNoteResult
				const convertResult: ConvertNoteResult = {
					type: result.type,
					effort: result.effort,
					alias: result.alias,
				};
				await this.performCanvasNodeConversion(node, canvasFile, convertResult, nodeText);
			}
		);
		modal.open();
		} catch (error) {
			await this.logger?.error("Failed to convert canvas node", error);
			new Notice("Failed to convert canvas node: " + (error as Error).message);
		}
	}

	/**
	 * Perform canvas node conversion or creation
	 * If node exists, converts it; if node is null but nodeId provided, finds and converts it; if neither, creates a new node
	 */
	private async performCanvasNodeConversion(
		node: any | null,
		canvasFile: TFile,
		result: ConvertNoteResult,
		nodeText: string,
		position?: { x: number; y: number }, // Optional position for new nodes
		nodeId?: string, // Optional nodeId to find node when node is null
		existingNotePath?: string // Optional notePath if file already exists
	): Promise<void> {
		try {
			// Set update flag
			this.isUpdatingCanvas = true;

			// Determine file path - use existing path if provided, otherwise generate
			const title = nodeText.split('\n')[0].trim() || "Untitled";
			const alias = result.alias?.trim() || title;
			let notePath: string;
			let id: string;
			
			if (existingNotePath) {
				// Use provided path (file already created in creation flow)
				notePath = existingNotePath;
				console.log('[Canvas Plugin] Using existing note path:', notePath);

				// Read ID from existing file's frontmatter
				const existingFile = this.app.vault.getAbstractFileByPath(notePath);
				if (existingFile instanceof TFile) {
					const fileContent = await this.app.vault.read(existingFile);
					const parsed = parseFrontmatter(fileContent);
					id = parsed?.id || await generateId(this.app, this.settings);
					console.log('[Canvas Plugin] Read ID from existing file:', id);
				} else {
					id = await generateId(this.app, this.settings);
				}
			} else {
				// Generate new path (conversion flow)
				id = await generateId(this.app, this.settings);
				const baseFolder = canvasFile.parent?.path || this.settings.notesBaseFolder;
				// Use title as filename, preserving whitespaces
				notePath = await generateUniqueFilename(
					this.app,
					baseFolder,
					title,
					"md"
				);
				console.log('[Canvas Plugin] Generated new note path:', notePath);
			}

			// Check if file already exists (e.g., from creation flow)
			const existingFile = this.app.vault.getAbstractFileByPath(notePath);
			if (!(existingFile instanceof TFile)) {
				// File doesn't exist - create it using template
				const now = new Date().toISOString();
				const frontmatter: ItemFrontmatter = {
					type: result.type,
					title: title,
					effort: result.effort,
					id,
					status: this.normalizeStatus("Not Started"),
					priority: this.normalizePriority("High"),
					inProgress: false,
					created_by_plugin: true,
					created: now,
					updated: now,
					canvas_source: canvasFile.path,
					vault_path: notePath,
					notion_page_id: undefined,
					collapsed_height: COLLAPSED_HEIGHT_DEFAULT,
					expanded_height: EXPANDED_HEIGHT_DEFAULT,
					expanded_width: EXPANDED_WIDTH_DEFAULT,
				};

				// Load template and replace placeholders
				const template = await this.loadTemplate(result.type);
				const content = replacePlaceholders(template, frontmatter);

				console.log('[Canvas Plugin] Creating note with content preview:', {
					firstLines: content.split('\n').slice(0, 10).join('\n'),
					hasFrontmatter: content.startsWith('---'),
					totalLines: content.split('\n').length
				});

				await this.app.vault.create(notePath, content);
				await this.logger?.info("Note created from canvas node", { path: notePath });
			} else {
				console.log('[Canvas Plugin] Note file already exists, skipping creation:', notePath);
			}

			// Get color for the node (inProgress is false for new conversions)
			const color = this.resolveNodeColor(result.effort, false);

			// Load canvas file
			const canvasData = await loadCanvasData(this.app, canvasFile);
			
			// Try to find existing node if provided
			let existingNode: CanvasNode | undefined;
			let resolvedNodeId: string | null = null;
			
			if (node) {
				const nodeData = node.getData();
				resolvedNodeId = nodeData.id;
				existingNode = canvasData.nodes.find((n: CanvasNode) => n.id === resolvedNodeId);
			} else if (nodeId) {
				// Node not provided but nodeId is - find it in canvas data
				resolvedNodeId = nodeId;
				existingNode = canvasData.nodes.find((n: CanvasNode) => n.id === resolvedNodeId);
			}
			
			if (existingNode) {
				// Convert existing node in-place
				console.log('[Canvas Plugin] Converting existing node in-place (keeping same ID)');
				
				existingNode.type = "file";
				existingNode.file = notePath;
				if (color) {
					existingNode.color = color;
				}
				existingNode.metadata = this.buildCanvasMetadata(
					result.type,
					title,
					result.effort,
					{
						alias,
						collapsed: true,
					},
					color
				);
				// Apply collapsed size and set expandedSize from frontmatter
				if (!existingNode.metadata) existingNode.metadata = {};
				// Read expanded size from frontmatter
				const sizeConfig = await this.getSizeConfigForFile(notePath);
				const expandedHeight = sizeConfig.expandedHeight ?? EXPANDED_HEIGHT_DEFAULT;
				const expandedWidth = sizeConfig.expandedWidth ?? EXPANDED_WIDTH_DEFAULT;
				existingNode.metadata.expandedSize = { width: expandedWidth, height: expandedHeight };
				existingNode.height = await this.getCollapsedHeightForFile(notePath);
				// Remove text property
				delete (existingNode as any).text;
				// Ensure styleAttributes exists for consistency
				if (!(existingNode as any).styleAttributes) {
					(existingNode as any).styleAttributes = {};
				}
			
				console.log('[Canvas Plugin] Node transformed:', {
					id: existingNode.id,
					type: existingNode.type,
					file: existingNode.file,
					color: existingNode.color
				});
				
				// Edges automatically remain valid (same node ID)
				const connectedEdges = canvasData.edges.filter((edge: any) => 
					edge.fromNode === resolvedNodeId || edge.toNode === resolvedNodeId
				);
				console.log('[Canvas Plugin]', connectedEdges.length, 'edges remain connected (no update needed)');
			} else {
				// Create new node (fallback when node not found)
				console.log('[Canvas Plugin] Node not found, creating new node');
				
				// Get size config
				const sizeConfig = await this.getSizeConfigForFile(notePath);
				const collapsedHeight = sizeConfig.collapsedHeight ?? COLLAPSED_HEIGHT_DEFAULT;
				const expandedHeight = sizeConfig.expandedHeight ?? EXPANDED_HEIGHT_DEFAULT;
				const expandedWidth = sizeConfig.expandedWidth ?? EXPANDED_WIDTH_DEFAULT;
				
				// Use provided position or calculate viewport center
				const center = position || getCanvasCenter(this.app, canvasFile);
				if (center.x === null || center.y === null || isNaN(center.x) || isNaN(center.y)) {
					center.x = 0;
					center.y = 0;
				}
				
				// Build metadata
				const metadata = this.buildCanvasMetadata(
					result.type,
					title,
					result.effort,
					{
						alias,
						collapsed: true,
					},
					color
				);
				
				// Add expandedSize to metadata
				metadata!.expandedSize = { width: expandedWidth, height: expandedHeight };
				
				// Create new node
				const newNode: CanvasNode = {
					id: generateNodeId(),
					type: "file",
					file: notePath,
					x: center.x,
					y: center.y,
					width: 400,
					height: collapsedHeight,
					metadata,
				} as any;
				(newNode as any).styleAttributes = {};
				
				if (color) {
					newNode.color = color;
				}
				
				canvasData.nodes.push(newNode);
				console.log('[Canvas Plugin] Added new node:', newNode);
			}
			
			// Unified save logic for both conversion and creation
			console.log('[Canvas Plugin] Saving canvas file...');
			await saveCanvasData(this.app, canvasFile, canvasData);
			console.log('[Canvas Plugin] Canvas file saved');

			// Force reload canvas to sync Obsidian's in-memory state with file
			// This ensures the node renders properly with file content preview
			console.log('[Canvas Plugin] Reloading canvas to sync in-memory state...');
			await reloadCanvasViewsWithViewport(this.app, canvasFile);
			console.log('[Canvas Plugin] Canvas reloaded');

			// Update cache after reload (re-read from file to ensure consistency)
			const reloadedCanvasData = await loadCanvasData(this.app, canvasFile);
			const currentNodeIds = new Set(reloadedCanvasData.nodes.map((n) => n.id));
			this.canvasNodeCache.set(canvasFile.path, currentNodeIds);
			console.log('[Canvas Plugin] Cache updated with', currentNodeIds.size, 'nodes');

			// Keep flag true longer to prevent deletion detection during auto-refresh
			setTimeout(() => {
				this.isUpdatingCanvas = false;
				console.log('[Canvas Plugin] isUpdatingCanvas set to false (delayed, conversion flow)');
			}, 500);
			
			// Log completion
			if (existingNode) {
				await this.logger?.info("Canvas node converted in-place", {
					nodeId: resolvedNodeId,
					path: notePath,
				});
				new Notice(`✅ Converted to ${result.type}: ${id}`);
			} else {
				await this.logger?.info("Canvas node created", {
					path: notePath,
				});
				new Notice(`✅ Created ${result.type}: ${id}`);
			}

			// Refresh the selection menu buttons after conversion
			// Wait a bit for the canvas to update, then refresh the menu
			setTimeout(async () => {
				// Clear old menu buttons first
				this.clearInjectedMenuButtons();
				// Re-inject menu buttons for the converted node
				if (node) {
					await this.addSelectionMenuButton(node);
				}
			}, 250);

			// Sync to Notion if enabled
			if (this.shouldSyncOnCreate()) {
				const createdFile = this.app.vault.getAbstractFileByPath(notePath);
				if (createdFile instanceof TFile) {
					await this.syncFileToNotion(createdFile);
				}
			}
		} catch (error) {
			this.isUpdatingCanvas = false;
			await this.logger?.error("Failed to perform canvas node conversion", error);
			new Notice("Failed to convert canvas node: " + (error as Error).message);
		}
	}

	/**
	 * Normalize status values to v2.1 human-readable set
	 */
	private normalizeStatus(status?: string): ItemStatus {
		const map: Record<string, ItemStatus> = {
			todo: "Not Started",
			"not started": "Not Started",
			in_progress: "In Progress",
			"in progress": "In Progress",
			done: "Completed",
			completed: "Completed",
			blocked: "Blocked",
		};

		if (!status) return "Not Started";
		const trimmed = status.trim();
		const lower = trimmed.toLowerCase();
		if (map[lower]) return map[lower];

		// If already a valid value, return as-is
		const allowed: ItemStatus[] = ["Not Started", "In Progress", "Completed", "Blocked"];
		if (allowed.includes(trimmed as ItemStatus)) {
			return trimmed as ItemStatus;
		}

		return "Not Started";
	}

	/**
	 * Normalize priority values to v2.1 human-readable set
	 */
	private normalizePriority(priority?: string): ItemPriority {
		const map: Record<string, ItemPriority> = {
			low: "Low",
			medium: "Medium",
			high: "High",
			critical: "Critical",
		};

		if (!priority) return "Medium";
		const trimmed = priority.trim();
		const lower = trimmed.toLowerCase();
		if (map[lower]) return map[lower];

		const allowed: ItemPriority[] = ["Low", "Medium", "High", "Critical"];
		if (allowed.includes(trimmed as ItemPriority)) {
			return trimmed as ItemPriority;
		}

		return "Medium";
	}

	private resolveEffortColor(effort?: string): string | undefined {
		if (!effort) return undefined;
		const colorFromSettings = this.settings.effortColorMap?.[effort];
		return colorFromSettings || getColorForEffort(effort);
	}

	/**
	 * Resolve node color - red if inProgress, otherwise effort-based
	 */
	private resolveNodeColor(effort?: string, inProgress?: boolean): string | undefined {
		if (inProgress) {
			return this.settings.inProgressColor; // Red when in progress
		}
		return this.resolveEffortColor(effort);
	}

	/**
	 * Build canvas metadata payload for structured notes
	 */
	private buildCanvasMetadata(
		type: ItemType,
		title: string,
		effort?: string,
		options?: { alias?: string; collapsed?: boolean },
		effortColor?: string
	): CanvasNode["metadata"] {
		const metadata: CanvasNode["metadata"] = {
			plugin: "structured-canvas-notes",
			collapsed: options?.collapsed ?? false,
			alias: options?.alias ?? title,
			shape: this.settings.shapeAccomplishment,
			showId: this.settings.showIdInCanvas,
		};

		const resolvedEffortColor = effortColor ?? this.resolveEffortColor(effort);
		if (resolvedEffortColor) {
			metadata.effortColor = resolvedEffortColor;
		}

		return metadata;
	}

	/**
	 * Handle canvas file modifications to detect node deletions
	 */
	/**
	 * Initialize cache for all existing canvas files on plugin load
	 */
	private async initializeCanvasNodeCache(): Promise<void> {
		try {
			console.log('[Canvas Plugin] Initializing canvas node cache...');
			const canvasFiles = this.app.vault.getFiles().filter(f => f.extension === "canvas");
			console.log('[Canvas Plugin] Found', canvasFiles.length, 'canvas files:', canvasFiles.map(f => f.path));

			for (const canvasFile of canvasFiles) {
				const canvasData = await loadCanvasData(this.app, canvasFile);
				console.log('[Canvas Plugin] Canvas data for', canvasFile.path, ':', {
					nodeCount: canvasData.nodes?.length ?? 0,
					edgeCount: canvasData.edges?.length ?? 0,
					nodes: canvasData.nodes?.map((n: any) => ({ id: n.id, type: n.type, file: n.file }))
				});
				const nodeIds = new Set(canvasData.nodes.map((n) => n.id));
				this.canvasNodeCache.set(canvasFile.path, nodeIds);
				console.log('[Canvas Plugin] Initialized cache for', canvasFile.path, 'with', nodeIds.size, 'nodes');
			}
			console.log('[Canvas Plugin] Cache initialization complete. Total cached canvases:', this.canvasNodeCache.size);
		} catch (error) {
			console.error('[Canvas Plugin] Failed to initialize canvas node cache:', error);
			await this.logger?.error("Failed to initialize canvas node cache", error);
		}
	}

	private async handleCanvasModification(canvasFile: TFile): Promise<void> {
		console.log('[Canvas Plugin] ===== Canvas modification detected =====');
		console.log('[Canvas Plugin] Canvas file:', canvasFile.path);
		console.log('[Canvas Plugin] isUpdatingCanvas flag:', this.isUpdatingCanvas);
	
		// Skip if we're currently updating the canvas ourselves
		if (this.isUpdatingCanvas) {
			console.log('[Canvas Plugin] Skipping modification handler - we are updating');
			return;
		}
		
		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			console.log('[Canvas Plugin] Loaded canvas data:', {
				nodeCount: canvasData.nodes?.length ?? 0,
				nodes: canvasData.nodes?.map((n: any) => ({ id: n.id, type: n.type, file: n.file }))
			});

			const currentNodeIds = new Set(canvasData.nodes.map((n) => n.id));
			const currentFileNodes = new Set(
				canvasData.nodes
					.filter((n) => n.type === "file" && n.file)
					.map((n) => n.file!)
			);

			console.log('[Canvas Plugin] Current node IDs:', Array.from(currentNodeIds));
			console.log('[Canvas Plugin] Current file nodes:', Array.from(currentFileNodes));

			// Get previously cached nodes
			const cachedNodeIds = this.canvasNodeCache.get(canvasFile.path) || new Set();
			console.log('[Canvas Plugin] Cached node IDs:', Array.from(cachedNodeIds));

			// Find deleted nodes (only if cache was previously populated)
			const deletedNodeIds = Array.from(cachedNodeIds).filter((id) => !currentNodeIds.has(id));

			if (deletedNodeIds.length > 0 && cachedNodeIds.size > 0) {
				// Only check for deletions if cache was populated (not first load)
				console.log('[Canvas Plugin] Detected', deletedNodeIds.length, 'deleted nodes');

				// Clear any selection menu buttons that might be stale
				this.clearInjectedMenuButtons();
				// Also clear selection buttons for deleted nodes
				for (const nodeId of deletedNodeIds) {
					this.removeSelectionButton(nodeId);
				}

				// Check all plugin-created files for this canvas, not just deleted node IDs
				// (since we don't know which files corresponded to which node IDs)
				await this.checkAndDeletePluginFile(canvasFile, currentFileNodes);
			} else if (cachedNodeIds.size === 0) {
				// Cache was empty, this might be first load - just update cache
				console.log('[Canvas Plugin] Cache was empty, initializing with current nodes');
			}

			// Update cache
			this.canvasNodeCache.set(canvasFile.path, currentNodeIds);
			console.log('[Canvas Plugin] Cache updated with', currentNodeIds.size, 'nodes');
		} catch (error) {
			await this.logger?.error("Failed to handle canvas modification", error);
		}
	}

	/**
	 * Check if any plugin-created files are no longer in the canvas and offer to delete
	 */
	private async checkAndDeletePluginFile(
		canvasFile: TFile,
		currentFileNodes: Set<string>
	): Promise<void> {
		try {
			console.log('[Canvas Plugin] checkAndDeletePluginFile called');
			console.log('[Canvas Plugin] Canvas file:', canvasFile.path);
			console.log('[Canvas Plugin] Current file nodes in canvas:', Array.from(currentFileNodes));

			// Get all markdown files in the vault
			const allFiles = this.app.vault.getMarkdownFiles();
			console.log('[Canvas Plugin] Total markdown files in vault:', allFiles.length);

			for (const file of allFiles) {
				const content = await this.app.vault.read(file);
				const frontmatter = parseFrontmatter(content);

				// Check if this file was created by our plugin
				const isPluginFile = frontmatter && isPluginCreatedNote(frontmatter);
				if (isPluginFile) {
					console.log('[Canvas Plugin] Found plugin-created file:', file.path);
					console.log('[Canvas Plugin] Frontmatter:', {
						type: frontmatter.type,
						id: frontmatter.id,
						canvas_source: frontmatter.canvas_source,
						created_by_plugin: frontmatter.created_by_plugin
					});

					// Check if file is referenced in canvas_source
					const canvasSources = Array.isArray(frontmatter.canvas_source)
						? frontmatter.canvas_source
						: [frontmatter.canvas_source];

					console.log('[Canvas Plugin] Canvas sources for file:', canvasSources);
					console.log('[Canvas Plugin] Current canvas path:', canvasFile.path);

					// If this note references the current canvas
					if (canvasSources.includes(canvasFile.path)) {
						// Check if the note is still in the canvas
						const isInCanvas = currentFileNodes.has(file.path);
						console.log('[Canvas Plugin] Is file still in canvas?', isInCanvas);

						if (!isInCanvas) {
							// File was removed from canvas, delete it
							console.log('[Canvas Plugin] Deleting file:', file.path);
							await this.app.vault.trash(file, true);
							new Notice(`🗑️ Deleted: ${file.basename}`);
							await this.logger?.info("Plugin-created file auto-deleted", {
								file: file.path,
								canvas: canvasFile.path,
							});
						}
					} else {
						console.log('[Canvas Plugin] File does not reference this canvas');
					}
				}
			}
		} catch (error) {
			console.error('[Canvas Plugin] Failed to check and delete plugin file:', error);
			await this.logger?.error("Failed to check and delete plugin file", error);
		}
	}
}


