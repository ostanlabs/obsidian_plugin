import { App, Plugin, TFile, Notice, normalizePath, TFolder, Menu, MenuItem } from "obsidian";
import {
	CanvasItemFromTemplateSettings,
	DEFAULT_SETTINGS,
	ItemFrontmatter,
	ItemType,
} from "./types";
import { CanvasStructuredItemsSettingTab } from "./settings";
import { ItemCreationModal, ItemCreationResult } from "./ui/ItemCreationModal";
import { ConvertNoteModal, ConvertNoteResult } from "./ui/ConvertNoteModal";
import { DeleteConfirmModal } from "./ui/DeleteConfirmModal";
import { NotionClient } from "./notion/notionClient";
import { Logger } from "./util/logger";
import { generateId } from "./util/idGenerator";
import {
	DEFAULT_TASK_TEMPLATE,
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
	closeCanvasViews,
	reopenCanvasViews,
	CanvasNode,
} from "./util/canvas";
import { addNodeToCanvasView, isCanvasOpen } from "./util/canvasView";
import { toSnakeCase, generateUniqueFilename, isPluginCreatedNote } from "./util/fileNaming";

export default class CanvasStructuredItemsPlugin extends Plugin {
	settings: CanvasItemFromTemplateSettings = DEFAULT_SETTINGS;
	notionClient: NotionClient | null = null;
	logger: Logger | null = null;
	// Track canvas nodes to detect deletions
	private canvasNodeCache: Map<string, Set<string>> = new Map();
	// Flag to prevent deletion detection during our own updates
	private isUpdatingCanvas: boolean = false;

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

		// Watch for canvas file modifications to detect node deletions
		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				if (file instanceof TFile && file.extension === "canvas") {
					await this.handleCanvasModification(file);
				}
			})
		);

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
		// Command 1: Create item from selected canvas node
		this.addCommand({
			id: "create-item-from-selected-node",
			name: "Canvas: Create Item From Template (Selected Node)",
			callback: async () => {
				await this.createItemFromSelectedNode();
			},
		});

		// Command 2: Create new item at canvas center
		this.addCommand({
			id: "new-item-at-position",
			name: "Canvas: New Item From Template (Center Position)",
			callback: async () => {
				await this.createNewItemAtPosition();
			},
		});

		// Command 3: Convert current note to structured item
		this.addCommand({
			id: "convert-note-to-structured-item",
			name: "Canvas Item: Convert Note to Structured Item",
			editorCallback: async (editor, view) => {
				const file = view.file;
				if (file && file.extension === "md") {
					await this.convertNoteToStructuredItem(file);
				} else {
					new Notice("No active note to convert");
				}
			},
		});

		// Command 4: Initialize Notion database
		this.addCommand({
			id: "initialize-notion-database",
			name: "Canvas Item: Initialize Notion Database",
			callback: async () => {
				await this.initializeNotionDatabase();
			},
		});

		// Command 5: Sync current note to Notion
		this.addCommand({
			id: "sync-current-note-to-notion",
			name: "Canvas Item: Sync Current Note to Notion",
			callback: async () => {
				await this.syncCurrentNoteToNotion();
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
	 * Create item from selected canvas node
	 */
	private async createItemFromSelectedNode(): Promise<void> {
		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			new Notice("No active canvas found");
			return;
		}

		// For now, we'll prompt the user to enter a node ID
		// In a real implementation, this would integrate with Canvas UI selection
		new Notice(
			"This command requires selecting a node in the canvas. Use 'New Item at Position' instead, or manually edit the canvas JSON."
		);
		await this.logger?.warn("Selected node command called but not fully implemented");
	}

	/**
	 * Create new item at canvas center
	 */
	private async createNewItemAtPosition(): Promise<void> {
		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			new Notice("No active canvas found");
			return;
		}

		// Show modal to get item details
		const modal = new ItemCreationModal(
			this.app,
			this.settings,
			"New Item",
			async (result) => {
				await this.createItemAndAddToCanvas(canvasFile, result, null);
			}
		);
		modal.open();
	}

	/**
	 * Create a note and add/update canvas node
	 */
	private async createItemAndAddToCanvas(
		canvasFile: TFile,
		itemData: ItemCreationResult,
		existingNodeId: string | null
	): Promise<void> {
		try {
			await this.logger?.info("Creating canvas item", itemData);

			// Generate ID
			const id = await generateId(this.app, this.settings, itemData.type);

			// Determine note path
			const notePath = await this.determineNotePath(canvasFile, itemData.title, id);

			// Create frontmatter
			const now = new Date().toISOString();
			const frontmatter: ItemFrontmatter = {
				type: itemData.type,
				title: itemData.title,
				effort: itemData.effort,
				id,
				parent: itemData.parent,
				status: "todo",
				priority: itemData.type === "accomplishment" ? "high" : "medium",
				created: now,
				updated: now,
				canvas_source: canvasFile.path,
				vault_path: notePath,
			};

			// Load template
			const template = await this.loadTemplate(itemData.type, itemData.templatePath);

			// Replace placeholders
			const content = replacePlaceholders(template, frontmatter);

			// Create the note
			await this.app.vault.create(notePath, content);
			await this.logger?.info("Note created", { path: notePath });

			// Update canvas
			await this.updateCanvas(canvasFile, notePath, existingNodeId, itemData.title, itemData.effort);

			new Notice(`Created ${itemData.type}: ${itemData.title} (${id})`);

			// Sync to Notion if enabled
			if (this.shouldSyncOnCreate()) {
				try {
					const pageId = await this.notionClient!.syncNote(frontmatter);
					// Update the note with the Notion page ID
					await this.updateNoteWithNotionId(notePath, pageId);
					new Notice("Synced to Notion");
				} catch (error) {
					await this.logger?.error("Failed to sync to Notion", error);
					new Notice("Failed to sync to Notion: " + (error as Error).message);
				}
			}
		} catch (error) {
			await this.logger?.error("Failed to create item", error);
			new Notice("Failed to create item: " + (error as Error).message);
		}
	}

	/**
	 * Determine the path for the new note
	 */
	private async determineNotePath(
		canvasFile: TFile,
		title: string,
		id: string
	): Promise<string> {
		let baseFolder: string;

		if (this.settings.inferBaseFolderFromCanvas) {
			// Use the same folder as the canvas file
			baseFolder = canvasFile.parent?.path || "";
		} else {
			baseFolder = this.settings.notesBaseFolder;
		}

		// Sanitize title for filename
		const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, "-");
		const filename = `${id}-${sanitizedTitle}.md`;

		// Ensure folder exists
		if (baseFolder) {
			await this.ensureFolderExists(baseFolder);
		}

		return normalizePath(baseFolder ? `${baseFolder}/${filename}` : filename);
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
			templatePath =
				type === "task"
					? this.settings.taskTemplatePath
					: this.settings.accomplishmentTemplatePath;
		}

		const file = this.app.vault.getAbstractFileByPath(templatePath);

		if (file instanceof TFile) {
			return await this.app.vault.read(file);
		}

		// Return default template if file not found
		await this.logger?.warn("Template not found, using default", {
			path: templatePath,
		});
		return type === "task"
			? DEFAULT_TASK_TEMPLATE
			: DEFAULT_ACCOMPLISHMENT_TEMPLATE;
	}

	/**
	 * Update canvas with new/modified node
	 */
	private async updateCanvas(
		canvasFile: TFile,
		notePath: string,
		existingNodeId: string | null,
		title: string,
		effort?: string
	): Promise<void> {
		console.log('[Canvas Plugin] updateCanvas called:', {
			canvasPath: canvasFile.path,
			notePath,
			existingNodeId,
			effort
		});
		
		// Set flag to prevent deletion detection during our update
		this.isUpdatingCanvas = true;
		
		// Check if canvas is currently open
		const canvasIsOpen = isCanvasOpen(this.app, canvasFile);
		console.log('[Canvas Plugin] Canvas is open:', canvasIsOpen);
		
		if (canvasIsOpen && !existingNodeId) {
			// Canvas is open - add node directly to the view
			const center = getCanvasCenter();
			const color = effort ? getColorForEffort(effort) : undefined;
			const newNode = createNode("file", center.x, center.y, 400, 100, {
				file: notePath,
				color,
			});
			
			console.log('[Canvas Plugin] Adding node directly to open canvas view:', newNode);
			const success = await addNodeToCanvasView(this.app, canvasFile, newNode);
			
			if (success) {
				// Update our cache
				const canvasData = await loadCanvasData(this.app, canvasFile);
				const nodeIds = new Set(canvasData.nodes.map((n) => n.id));
				this.canvasNodeCache.set(canvasFile.path, nodeIds);
				
				this.isUpdatingCanvas = false;
				new Notice(`✅ Item created and added to canvas!`, 4000);
				console.log('[Canvas Plugin] Node added directly - no reopen needed');
				return;
			}
			
			console.log('[Canvas Plugin] Direct add failed, falling back to file manipulation');
		}
		
		// Canvas is closed OR direct manipulation failed - use file manipulation
		if (canvasIsOpen) {
			// Close canvas views BEFORE modifying the JSON
			const closedLeaves = await closeCanvasViews(this.app, canvasFile);
			console.log('[Canvas Plugin] Closed', closedLeaves.length, 'leaves');
			
			// Give Obsidian a moment to release the file
			await new Promise(resolve => setTimeout(resolve, 150));
		}
		
		const canvasData = await loadCanvasData(this.app, canvasFile);
		console.log('[Canvas Plugin] Loaded canvas data:', {
			nodeCount: canvasData.nodes.length,
			fileNodeCount: canvasData.nodes.filter(n => n.type === 'file').length
		});

		if (existingNodeId) {
			// Update existing node
			const node = findNodeById(canvasData, existingNodeId);
			if (node) {
				const fileNode = convertTextNodeToFile(node, notePath);
				const nodeIndex = canvasData.nodes.findIndex((n) => n.id === existingNodeId);
				canvasData.nodes[nodeIndex] = fileNode;
				console.log('[Canvas Plugin] Updated existing node');
			}
		} else {
			// Create new node at center
			const center = getCanvasCenter();
			const color = effort ? getColorForEffort(effort) : undefined;
			const newNode = createNode("file", center.x, center.y, 400, 100, {
				file: notePath,
				color,
			});
			console.log('[Canvas Plugin] Created new node:', newNode);
			addNode(canvasData, newNode);
			console.log('[Canvas Plugin] Added node, new count:', canvasData.nodes.length);
		}

		await saveCanvasData(this.app, canvasFile, canvasData);
		await this.logger?.info("Canvas updated", { path: canvasFile.path });

		// Update canvas node cache
		const nodeIds = new Set(canvasData.nodes.map((n) => n.id));
		this.canvasNodeCache.set(canvasFile.path, nodeIds);

		// Clear the flag after a delay
		setTimeout(() => {
			this.isUpdatingCanvas = false;
			console.log('[Canvas Plugin] Update flag cleared');
		}, 1000);

		// Show message
		new Notice(`✅ Item created! ${canvasIsOpen ? 'Reopen' : 'Open'} "${canvasFile.name}" to see it.`, 8000);
		console.log('[Canvas Plugin] updateCanvas complete');
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

			if (frontmatter.type !== "task" && frontmatter.type !== "accomplishment") {
				new Notice("This note is not a task or accomplishment");
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
	 * Ensure templates exist, creating them if necessary
	 */
	async ensureTemplatesExist(force = false): Promise<void> {
		const templates = [
			{
				path: this.settings.taskTemplatePath,
				content: DEFAULT_TASK_TEMPLATE,
				name: "Task",
			},
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
	 */
	private addCanvasContextMenu(menu: Menu, canvasFile: TFile): void {
		menu.addItem((item: MenuItem) => {
			item
				.setTitle("Create Item From Template")
				.setIcon("plus-circle")
				.onClick(async () => {
					const modal = new ItemCreationModal(
						this.app,
						this.settings,
						"New Item",
						async (result) => {
							await this.createItemAndAddToCanvas(canvasFile, result, null);
						}
					);
					modal.open();
				});
		});

		menu.addItem((item: MenuItem) => {
			item
				.setTitle("Create Task")
				.setIcon("check-square")
				.onClick(async () => {
					const modal = new ItemCreationModal(
						this.app,
						this.settings,
						"New Task",
						async (result) => {
							result.type = "task"; // Force task type
							await this.createItemAndAddToCanvas(canvasFile, result, null);
						}
					);
					modal.open();
				});
		});

		menu.addItem((item: MenuItem) => {
			item
				.setTitle("Create Accomplishment")
				.setIcon("trophy")
				.onClick(async () => {
					const modal = new ItemCreationModal(
						this.app,
						this.settings,
						"New Accomplishment",
						async (result) => {
							result.type = "accomplishment"; // Force accomplishment type
							await this.createItemAndAddToCanvas(canvasFile, result, null);
						}
					);
					modal.open();
				});
		});
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
				setTimeout(() => this.addCanvasNodeMenuItemToDOM(currentContextNode), 50);
				setTimeout(() => this.addCanvasNodeMenuItemToDOM(currentContextNode), 100);
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
	private addCanvasNodeMenuItemToDOM(targetNode: any): void {
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

			const nodeData = targetNode.getData?.();
			if (!nodeData || nodeData.type !== "text") {
				console.log('[Canvas Plugin] Not a text node, type:', nodeData?.type);
				return;
			}

			console.log('[Canvas Plugin] Adding menu item for text node:', targetNode.id);

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
			const content = await this.app.vault.read(file);
			const { frontmatter, body } = parseFrontmatterAndBody(content);

			// Show modal to get item details
			const fileNameWithoutExt = file.basename;
			const modal = new ConvertNoteModal(
				this.app,
				this.settings,
				fileNameWithoutExt,
				async (result) => {
					await this.performNoteConversion(file, result, frontmatter, body);
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
			const id = await generateId(this.app, this.settings, result.type);

			// Determine new filename
			let newPath: string;
			if (result.keepOriginalName) {
				// Keep the same path
				newPath = file.path;
			} else {
				// Generate snake_case filename with ID
				const snakeCaseTitle = toSnakeCase(file.basename);
				const baseFolder = file.parent?.path || "";
				newPath = await generateUniqueFilename(
					this.app,
					baseFolder,
					`${id}_${snakeCaseTitle}`,
					"md"
				);
			}

			// Create new frontmatter (merge with existing)
			const now = new Date().toISOString();
			const newFrontmatter: ItemFrontmatter = {
				...existingFrontmatter, // Keep existing fields
				type: result.type,
				title: file.basename,
				effort: result.effort,
				id,
				parent: result.parent,
				status: existingFrontmatter.status || "todo",
				priority: existingFrontmatter.priority || (result.type === "accomplishment" ? "high" : "medium"),
				created: existingFrontmatter.created || now,
				updated: now,
				canvas_source: existingFrontmatter.canvas_source || "",
			};

			// Update note content
			const newContent = createWithFrontmatter(body, newFrontmatter);

			// Rename/move file if needed
			if (newPath !== file.path) {
				await this.app.fileManager.renameFile(file, newPath);
			}

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
			const nodeData = node.getData();
			const canvasView = node.canvas?.view;
			const canvasFile = canvasView?.file;

			if (!canvasFile) {
				new Notice("Could not find canvas file");
				return;
			}

			// Get node text as title
			const nodeText = nodeData.text || "Untitled";
			const title = nodeText.split('\n')[0].substring(0, 100); // First line, max 100 chars

			// Show modal to get item details
			const modal = new ConvertNoteModal(
				this.app,
				this.settings,
				title,
				async (result) => {
					await this.performCanvasNodeConversion(node, canvasFile, result, nodeText);
				}
			);
			modal.open();
		} catch (error) {
			await this.logger?.error("Failed to convert canvas node", error);
			new Notice("Failed to convert canvas node: " + (error as Error).message);
		}
	}

	/**
	 * Perform the actual canvas node conversion
	 */
	private async performCanvasNodeConversion(
		node: any,
		canvasFile: TFile,
		result: ConvertNoteResult,
		nodeText: string
	): Promise<void> {
		try {
			// Set update flag
			this.isUpdatingCanvas = true;

			// Generate ID
			const id = await generateId(this.app, this.settings, result.type);

			// Determine file path
			const title = nodeText.split('\n')[0].trim() || "Untitled";
			const snakeCaseTitle = toSnakeCase(title);
			const baseFolder = canvasFile.parent?.path || this.settings.notesBaseFolder;
			
			const notePath = await generateUniqueFilename(
				this.app,
				baseFolder,
				`${id}_${snakeCaseTitle}`,
				"md"
			);

			// Create frontmatter
			const now = new Date().toISOString();
			const frontmatter: ItemFrontmatter = {
				type: result.type,
				title: title,
				effort: result.effort,
				id,
				parent: result.parent || undefined, // Use undefined instead of empty string
				status: "todo",
				priority: result.type === "accomplishment" ? "high" : "medium",
				created: now,
				updated: now,
				canvas_source: canvasFile.path,
				vault_path: notePath,
				notion_page_id: undefined, // Use undefined instead of empty string
			} as any; // Cast to bypass type check for undefined

			// Create note content
			const content = createWithFrontmatter(nodeText, frontmatter);
			
			console.log('[Canvas Plugin] Creating note with content preview:', {
				firstLines: content.split('\n').slice(0, 10).join('\n'),
				hasFrontmatter: content.startsWith('---'),
				totalLines: content.split('\n').length
			});

			// Create the file
			await this.app.vault.create(notePath, content);
			await this.logger?.info("Note created from canvas node", { path: notePath });

			// Get node position and data
			const nodeData = node.getData();
			const nodeId = nodeData.id;
			
			const noteFile = this.app.vault.getAbstractFileByPath(notePath);
			if (!(noteFile instanceof TFile)) {
				throw new Error("Created file not found");
			}

			// Get color for the new node
			const color = getColorForEffort(result.effort);

			console.log('[Canvas Plugin] File-only update - letting Obsidian handle refresh');
			
			// Load canvas file
			const canvasData = await loadCanvasData(this.app, canvasFile);
			const existingNode = canvasData.nodes.find((n: CanvasNode) => n.id === nodeId);
			
			if (!existingNode) {
				throw new Error("Node not found in canvas file");
			}
			
			console.log('[Canvas Plugin] Updating node in-place (keeping same ID)');
			
			// Transform the node in-place (keep the same ID!)
			existingNode.type = "file";
			existingNode.file = notePath;
			if (color) {
				existingNode.color = color;
			}
			// Remove text property
			delete (existingNode as any).text;
			
			console.log('[Canvas Plugin] Node transformed:', {
				id: existingNode.id,
				type: existingNode.type,
				file: existingNode.file,
				color: existingNode.color
			});
			
			// Edges automatically remain valid (same node ID)
			const connectedEdges = canvasData.edges.filter((edge: any) => 
				edge.fromNode === nodeId || edge.toNode === nodeId
			);
			console.log('[Canvas Plugin]', connectedEdges.length, 'edges remain connected (no update needed)');
			
			console.log('[Canvas Plugin] Saving canvas file...');
			
			// Update our cache with current node IDs
			const nodeIds = new Set(canvasData.nodes.map((n: CanvasNode) => n.id));
			this.canvasNodeCache.set(canvasFile.path, nodeIds);
			
			// Save the canvas file
			await saveCanvasData(this.app, canvasFile, canvasData);
			
			console.log('[Canvas Plugin] Canvas file saved, forcing reload...');
			
			// Find the canvas leaf
			const leaves = this.app.workspace.getLeavesOfType("canvas");
			const canvasLeaf = leaves.find(leaf => {
				const view = leaf.view as any;
				return view.file?.path === canvasFile.path;
			});
			
			if (canvasLeaf) {
				console.log('[Canvas Plugin] Canvas is open, reloading view');
				
				const view = canvasLeaf.view as any;
				
				// Capture current viewport state
				const viewportState = {
					x: view.canvas?.x ?? 0,
					y: view.canvas?.y ?? 0,
					zoom: view.canvas?.zoom ?? 1
				};
				
				console.log('[Canvas Plugin] Captured viewport:', viewportState);
				
				// Close and immediately reopen to force type change to render
				await canvasLeaf.setViewState({ type: "empty" });
				
				// Minimal wait
				await new Promise(resolve => setTimeout(resolve, 10));
				
				// Reopen with viewport state
				await canvasLeaf.setViewState({
					type: "canvas",
					state: { 
						file: canvasFile.path,
						viewState: viewportState
					}
				});
				
				// Give Obsidian a moment to render, then restore viewport
				await new Promise(resolve => setTimeout(resolve, 50));
				
				// Manually restore viewport if needed (belt and suspenders)
				const newView = canvasLeaf.view as any;
				if (newView.canvas) {
					newView.canvas.x = viewportState.x;
					newView.canvas.y = viewportState.y;
					newView.canvas.zoom = viewportState.zoom;
					newView.canvas.requestFrame();
					console.log('[Canvas Plugin] Restored viewport:', viewportState);
				}
				
				console.log('[Canvas Plugin] Canvas reloaded - type change should be visible');
			} else {
				console.log('[Canvas Plugin] Canvas not open');
			}
			
			await this.logger?.info("Canvas node converted in-place", { 
				nodeId,
				path: notePath,
				edgesPreserved: connectedEdges.length 
			});
			
			new Notice(`✅ Converted to ${result.type}: ${id}`, 3000);

			// Clear update flag
			setTimeout(() => {
				this.isUpdatingCanvas = false;
			}, 1000);

			new Notice(`✅ Canvas node converted to ${result.type}: ${id}`);

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
	 * Handle canvas file modifications to detect node deletions
	 */
	private async handleCanvasModification(canvasFile: TFile): Promise<void> {
		// Skip if we're currently updating the canvas ourselves
		if (this.isUpdatingCanvas) {
			console.log('[Canvas Plugin] Skipping modification handler - we are updating');
			return;
		}
		
		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			const currentNodeIds = new Set(canvasData.nodes.map((n) => n.id));
			const currentFileNodes = new Set(
				canvasData.nodes
					.filter((n) => n.type === "file" && n.file)
					.map((n) => n.file!)
			);

			// Get previously cached nodes
			const cachedNodeIds = this.canvasNodeCache.get(canvasFile.path) || new Set();

			// Find deleted nodes
			const deletedNodeIds = Array.from(cachedNodeIds).filter((id) => !currentNodeIds.has(id));

			if (deletedNodeIds.length > 0) {
				console.log('[Canvas Plugin] Detected', deletedNodeIds.length, 'deleted nodes');
				// Find which file nodes were deleted
				for (const nodeId of deletedNodeIds) {
					// We need to check if this was a file node and if the file should be deleted
					// Since we don't have the old canvas data, we check all our plugin-created files
					await this.checkAndDeletePluginFile(canvasFile, currentFileNodes);
				}
			}

			// Update cache
			this.canvasNodeCache.set(canvasFile.path, currentNodeIds);
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
			// Get all markdown files in the vault
			const allFiles = this.app.vault.getMarkdownFiles();

			for (const file of allFiles) {
				const content = await this.app.vault.read(file);
				const frontmatter = parseFrontmatter(content);

				// Check if this file was created by our plugin
				if (frontmatter && isPluginCreatedNote(frontmatter)) {
					// Check if file is referenced in canvas_source
					const canvasSources = Array.isArray(frontmatter.canvas_source)
						? frontmatter.canvas_source
						: [frontmatter.canvas_source];

					// If this note references the current canvas
					if (canvasSources.includes(canvasFile.path)) {
						// Check if the note is still in the canvas
						const isInCanvas = currentFileNodes.has(file.path);

						if (!isInCanvas) {
							// File was removed from canvas, offer to delete
							const modal = new DeleteConfirmModal(
								this.app,
								file.basename,
								async () => {
									await this.app.vault.trash(file, true);
									new Notice(`🗑️ Deleted: ${file.basename}`);
									await this.logger?.info("Plugin-created file deleted", {
										file: file.path,
										canvas: canvasFile.path,
									});
								}
							);
							modal.open();
						}
					}
				}
			}
		} catch (error) {
			await this.logger?.error("Failed to check and delete plugin file", error);
		}
	}
}


