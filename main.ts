import { Plugin, TFile, Notice, normalizePath, Menu, MenuItem, WorkspaceLeaf, Modal, App } from "obsidian";
import * as http from "http";
import {
	CanvasItemFromTemplateSettings,
	DEFAULT_SETTINGS,
	ItemFrontmatter,
	FeatureFrontmatter,
	EntityType,
	ItemStatus,
	ItemPriority,
	FeatureTier,
	FeaturePhase,
	FeatureStatus,
	InternalCanvasNode,
	InternalCanvas,
	CanvasNodeResult,
	NotionBlock,
	NotionRichText,
	NotionPage,
	InternalCanvasView,
} from "./types";
import { CanvasStructuredItemsSettingTab } from "./settings";
import { StructuredItemModal, StructuredItemResult, StructuredItemModalOptions } from "./ui/StructuredItemModal";
import { FeatureModal, FeatureModalResult } from "./ui/FeatureModal";
import { LinkFeatureModal, LinkFeatureModalResult, FeatureOption } from "./ui/LinkFeatureModal";
import { FeatureDetailsView, FEATURE_DETAILS_VIEW_TYPE } from "./ui/FeatureDetailsView";
import { FeatureCoverageView, FEATURE_COVERAGE_VIEW_TYPE } from "./ui/FeatureCoverageView";
import { NotionClient } from "./notion/notionClient";

// Result interfaces for internal mapping
interface ConvertNoteResult {
	type: EntityType;
	effort: string;
	alias?: string;
}

import { Logger } from "./util/logger";
import { generateId } from "./util/idGenerator";
import {
	DEFAULT_ACCOMPLISHMENT_TEMPLATE,
	DEFAULT_FEATURE_TEMPLATE,
	replacePlaceholders,
	replaceFeaturePlaceholders,
} from "./util/template";
import { parseFrontmatter, parseAnyFrontmatter, updateFrontmatter, parseFrontmatterAndBody, createWithFrontmatter } from "./util/frontmatter";
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
	CanvasEdge,
	CanvasData,
	generateNodeId,
	createEdge,
	addEdge,
	edgeExists,
	findNodeByEntityId,
} from "./util/canvas";
import { generateUniqueFilename, isPluginCreatedNote } from "./util/fileNaming";
import { addNodesToCanvasView, getCanvasView, hasInternalCanvasAPI, inspectCanvasAPI, addEdgesToCanvasView } from "./util/canvasView";
import { EntityIndex, EntityIndexEntry, getEntityTypeFromId } from "./util/entityNavigator";
import { PositioningEngineV3, EntityData, PositioningResult, EntityType as PositioningEntityType } from "./util/positioningV3";
import { PositioningEngineV4, EntityData as EntityDataV4 } from "./util/positioningV4";
import { parseEntityFromFrontmatter, generateNodeIdFromEntityId } from "./util/entityParser";
import { reconcileRelationships, cleanTransitiveDependencies, detectAndBreakCycles } from "./util/relationshipReconciler";

const DEFAULT_NODE_HEIGHT = 220;
const DEFAULT_NODE_WIDTH = 400;

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
	private lastSelectedMenuNode: InternalCanvasNode | null = null;
	private selectionMenuIntervalId: number | null = null;
	// Track node size for resize detection
	private lastPointerNodeSize: { id: string; width: number; height: number; ref: InternalCanvasNode; el: HTMLElement } | null = null;
	private nodeSizeCache: WeakMap<HTMLElement, { w: number; h: number }> = new WeakMap();
	private isResizing: boolean = false;
	// Debounce timers for MD file sync to Notion
	private mdSyncDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	// Cache file path -> entity ID for deletion sync
	private fileEntityIdCache: Map<string, string> = new Map();
	// Bi-directional sync polling interval
	private notionSyncIntervalId: ReturnType<typeof setInterval> | null = null;
	// Debounce timer for edge sync (per canvas file)
	private edgeSyncDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	// Canvas visibility toggles state
	private visibilityState: { tasks: boolean; stories: boolean; milestones: boolean; decisions: boolean; documents: boolean; features: boolean } = {
		tasks: true,
		stories: true,
		milestones: true,
		decisions: true,
		documents: true,
		features: true,
	};
	// Control panel element reference
	private controlPanelEl: HTMLElement | null = null;
	// Entity Navigator index
	private entityIndex: EntityIndex | null = null;
	// HTTP Server instance
	private httpServer: http.Server | null = null;

	private getCanvasNodeFromEventTarget(target: EventTarget | null): CanvasNodeResult | null {
		if (!(target instanceof HTMLElement)) return null;
		const selectors = [".canvas-node", ".canvas-card"];
		for (const sel of selectors) {
			const el = target.closest<HTMLElement>(sel);
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
						this.isResizing = true;
						console.debug("[Canvas Plugin] isResizing -> true (observer size change)");
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
		this.logger = new Logger(this.app, "canvas-project-manager");
		this.logger.info("Plugin loaded");

		// Initialize Notion client
		this.notionClient = new NotionClient(this.settings, this.logger);

		// Setup CSS styles (creates snippet if needed)
		await this.setupStyles();

		// Ensure templates exist
		await this.ensureTemplatesExist();

		// Add settings tab
		this.addSettingTab(new CanvasStructuredItemsSettingTab(this.app, this));

		// Register Feature Details View
		this.registerView(
			FEATURE_DETAILS_VIEW_TYPE,
			(leaf) => new FeatureDetailsView(leaf)
		);

		// Register Feature Coverage View
		this.registerView(
			FEATURE_COVERAGE_VIEW_TYPE,
			(leaf) => new FeatureCoverageView(leaf)
		);

		// Register commands
		this.registerCommands();

	// Register canvas context menu (file explorer)
	this.registerEvent(
		this.app.workspace.on("file-menu", (menu, file) => {
			if (file instanceof TFile && file.extension === "canvas") {
				console.debug("[Canvas Plugin] Canvas context menu opened (right-click on canvas file)", {
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

		// Watch for MD file modifications to update canvas node colors (e.g., inProgress)
		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				if (file instanceof TFile && file.extension === "md") {
					await this.handleMdFileModification(file);
				}
			})
		);

		// Watch for MD file deletions to archive corresponding Notion pages
		this.registerEvent(
			this.app.vault.on("delete", async (file) => {
				if (file instanceof TFile && file.extension === "md") {
					await this.handleMdFileDeletion(file);
				}
			})
		);

		// Initialize cache after layout is ready (vault files are indexed)
		this.app.workspace.onLayoutReady(async () => {
			console.debug('[Canvas Plugin] Layout ready, initializing caches...');
			await this.initializeCanvasNodeCache();
			await this.initializeFileEntityIdCache();
			// Start bi-directional sync polling if enabled
			this.startNotionSyncPolling();
			// Apply visual styles to any open canvas views
			this.applyStylesToAllCanvasViews();
			// Initialize Entity Navigator index
			await this.initializeEntityNavigator();
			// Start HTTP server if enabled
			this.startHttpServer();
		});

		// Watch for canvas views opening to apply styles
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view?.getViewType() === "canvas") {
					// Delay to let canvas render
					setTimeout(() => this.applyStylesToCanvasView(leaf.view), 100);
				}
			})
		);

		// Also watch for layout changes (new splits, etc.)
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.applyStylesToAllCanvasViews();
			})
		);

		this.logger.info("Plugin initialization complete");
	}

	onunload() {
		// Stop bi-directional sync polling
		this.stopNotionSyncPolling();
		// Stop HTTP server
		this.stopHttpServer();
		// Remove control panel if exists
		this.removeControlPanel();
		void this.logger?.info("Plugin unloaded");
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
		// Restart polling with new interval if settings changed
		this.restartNotionSyncPolling();
	}

/**
 * Register all plugin commands
 */
private registerCommands(): void {
	// Command 1: Initialize Notion database
	this.addCommand({
		id: "initialize-notion-database",
		name: "Project Canvas: Initialize Notion database",
		callback: async () => {
			await this.initializeNotionDatabase();
		},
	});

	// Command 2: Sync current note to Notion
	this.addCommand({
		id: "sync-current-note-to-notion",
		name: "Project Canvas: Sync current note to Notion",
		callback: async () => {
			await this.syncCurrentNoteToNotion();
		},
	});

	// Command 3: Regenerate templates
	this.addCommand({
		id: "regenerate-templates",
		name: "Project Canvas: Regenerate templates",
		callback: async () => {
			await this.ensureTemplatesExist(true);
			new Notice("Templates regenerated successfully");
		},
	});

	// Command 4: Sync all notes in current canvas to Notion
	this.addCommand({
		id: "sync-canvas-notes-to-notion",
		name: "Project Canvas: Sync all canvas notes to Notion",
		callback: async () => {
			await this.syncAllCanvasNotesToNotion();
		},
	});

	// Command 5: Sync canvas edges to MD depends_on fields
	this.addCommand({
		id: "sync-edges-to-depends-on",
		name: "Project Canvas: Sync edges to dependencies",
		callback: async () => {
			await this.syncEdgesToDependsOnCommand();
		},
	});

	// Command 6: Populate canvas from vault entities
	this.addCommand({
		id: "populate-canvas-from-vault",
		name: "Project Canvas: Populate from vault",
		callback: async () => {
			await this.populateCanvasFromVault();
		},
	});

	// Command 7: Debug - Inspect canvas API
	this.addCommand({
		id: "inspect-canvas-api",
		name: "Project Canvas: [DEBUG] Inspect canvas API",
		callback: () => {
			const canvasFile = this.getActiveCanvasFile();
			if (!canvasFile) {
				new Notice("No active canvas file");
				return;
			}
			inspectCanvasAPI(this.app, canvasFile);
			new Notice("Check console for canvas API inspection results");
		},
	});

	// Command 8: Reposition canvas nodes (V4 algorithm - default)
	this.addCommand({
		id: "reposition-canvas-nodes",
		name: "Project Canvas: Reposition nodes (V4 algorithm)",
		callback: async () => {
			await this.repositionCanvasNodesV4();
		},
	});

	// Command 8b: Reposition canvas nodes (V3 algorithm - legacy)
	this.addCommand({
		id: "reposition-canvas-nodes-v3",
		name: "Project Canvas: Reposition nodes (V3 algorithm)",
		callback: async () => {
			await this.repositionCanvasNodesV3();
		},
	});

	// Command 8c: Reposition canvas nodes (legacy V2 algorithm)
	this.addCommand({
		id: "reposition-canvas-nodes-v2",
		name: "Project Canvas: Reposition nodes (legacy V2)",
		callback: async () => {
			await this.repositionCanvasNodes();
		},
	});

	// Command 9: Strip IDs from filenames
	this.addCommand({
		id: "strip-ids-from-filenames",
		name: "Project Canvas: Strip IDs from filenames",
		callback: async () => {
			await this.stripIdsFromFilenames();
		},
	});

	// Command 10: Remove duplicate nodes
	this.addCommand({
		id: "remove-duplicate-nodes",
		name: "Project Canvas: Remove duplicate nodes",
		callback: async () => {
			await this.removeDuplicateNodes();
		},
	});

	// Command 11: Migrate decision fields (enables/blocks -> affects)
	this.addCommand({
		id: "migrate-decision-fields",
		name: "Project Canvas: Migrate decision fields (enables → affects)",
		callback: async () => {
			await this.migrateDecisionFieldsInVault();
		},
	});

	// Entity Navigator Commands
	this.addCommand({
		id: "entity-nav-go-to-parent",
		name: "Entity Navigator: Go to Parent",
		hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "p" }],
		callback: () => this.navigateToParent(),
	});

	this.addCommand({
		id: "entity-nav-go-to-children",
		name: "Entity Navigator: Go to Children",
		callback: () => this.navigateToChildren(),
	});

	this.addCommand({
		id: "entity-nav-go-to-dependencies",
		name: "Entity Navigator: Go to Dependencies",
		callback: () => this.navigateToDependencies(),
	});

	this.addCommand({
		id: "entity-nav-go-to-documents",
		name: "Entity Navigator: Go to Documents",
		hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "d" }],
		callback: () => this.navigateToDocuments(),
	});

	this.addCommand({
		id: "entity-nav-go-to-decisions",
		name: "Entity Navigator: Go to Decisions",
		hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "e" }],
		callback: () => this.navigateToDecisions(),
	});

	this.addCommand({
		id: "entity-nav-go-to-enabled",
		name: "Entity Navigator: Go to Enabled Entities (for decisions)",
		callback: () => this.navigateToEnabledEntities(),
	});

	this.addCommand({
		id: "entity-nav-rebuild-index",
		name: "Entity Navigator: Rebuild Index",
		callback: async () => {
			if (this.entityIndex) {
				await this.entityIndex.buildIndex();
				new Notice("Entity index rebuilt");
			}
		},
	});

	// Command: Search for entity on canvas
	this.addCommand({
		id: "search-entity-on-canvas",
		name: "Project Canvas: Search Entity on Canvas",
		hotkeys: [{ modifiers: ["Mod", "Shift"], key: "f" }],
		callback: () => {
			// Create a dummy anchor element for the popup
			const dummyAnchor = document.createElement("div");
			this.showEntitySearchPopup(dummyAnchor);
		},
	});

	// Command: Focus on In Progress entities
	this.addCommand({
		id: "focus-in-progress",
		name: "Project Canvas: Focus on In Progress",
		callback: async () => {
			await this.focusOnInProgressEntities();
		},
	});

	// Feature Entity Commands
	this.addCommand({
		id: "create-feature",
		name: "Project Canvas: Create Feature",
		callback: async () => {
			await this.createFeature();
		},
	});

	this.addCommand({
		id: "set-feature-phase",
		name: "Project Canvas: Set Feature Phase",
		callback: async () => {
			await this.setFeaturePhase();
		},
	});

	this.addCommand({
		id: "set-feature-tier",
		name: "Project Canvas: Set Feature Tier",
		callback: async () => {
			await this.setFeatureTier();
		},
	});

	this.addCommand({
		id: "entity-nav-go-to-features",
		name: "Entity Navigator: Go to Features",
		callback: () => this.navigateToFeatures(),
	});

	// Feature Canvas Commands
	this.addCommand({
		id: "create-features-canvas",
		name: "Project Canvas: Create Features Canvas",
		callback: async () => {
			await this.createFeaturesCanvas();
		},
	});

	this.addCommand({
		id: "auto-layout-features",
		name: "Project Canvas: Auto-Layout Features Canvas",
		callback: async () => {
			await this.autoLayoutFeaturesCanvas();
		},
	});

	this.addCommand({
		id: "populate-features-canvas",
		name: "Project Canvas: Populate Features Canvas from Vault",
		callback: async () => {
			await this.populateFeaturesCanvas();
		},
	});

	this.addCommand({
		id: "reconcile-relationships",
		name: "Project Canvas: Reconcile All Relationships",
		callback: async () => {
			await this.reconcileAllRelationships();
		},
	});

	this.addCommand({
		id: "link-to-feature",
		name: "Project Canvas: Link Current Entity to Feature",
		callback: async () => {
			await this.linkCurrentEntityToFeature();
		},
	});

	this.addCommand({
		id: "open-feature-details",
		name: "Project Canvas: Open Feature Details Panel",
		callback: async () => {
			await this.activateFeatureDetailsView();
		},
	});

	this.addCommand({
		id: "view-feature-coverage",
		name: "Project Canvas: View Feature Coverage Report",
		callback: async () => {
			await this.activateFeatureCoverageView();
		},
	});

	this.addCommand({
		id: "import-future-features",
		name: "Project Canvas: Import from FUTURE_FEATURES.md",
		callback: async () => {
			await this.importFromFutureFeatures();
		},
	});

	this.addCommand({
		id: "suggest-feature-links",
		name: "Project Canvas: Suggest Feature Links",
		callback: async () => {
			await this.suggestFeatureLinks();
		},
	});

	this.addCommand({
		id: "bulk-link-features",
		name: "Project Canvas: Bulk Link Features",
		callback: async () => {
			await this.bulkLinkFeatures();
		},
	});

	// Command: Unarchive all stories and tasks
	this.addCommand({
		id: "unarchive-stories-and-tasks",
		name: "Project Canvas: Unarchive All Stories and Tasks",
		callback: async () => {
			await this.unarchiveStoriesAndTasks();
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
	 * Command handler: Sync all edges in current canvas to MD depends_on fields
	 */
	private async syncEdgesToDependsOnCommand(): Promise<void> {
		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			new Notice("Please open a canvas file first");
			return;
		}

		new Notice("Syncing edges to dependencies...");

		try {
			// Clear any pending debounce timer for this canvas
			const existingTimer = this.edgeSyncDebounceTimers.get(canvasFile.path);
			if (existingTimer) {
				clearTimeout(existingTimer);
				this.edgeSyncDebounceTimers.delete(canvasFile.path);
			}

			// Run sync immediately
			await this.syncEdgesToMdFiles(canvasFile);
			new Notice("✅ edge sync complete");
		} catch (error) {
			new Notice("❌ Failed to sync edges: " + (error as Error).message);
			this.logger?.error("Failed to sync edges command", error);
		}
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
		return generateUniqueFilename(this.app, baseFolder, title, "md");
	}

	/**
	 * Ensure a folder exists
	 */
	private async ensureFolderExists(folderPath: string): Promise<void> {
		const normalizedPath = normalizePath(folderPath);
		const exists = await this.app.vault.adapter.exists(normalizedPath);

		if (!exists) {
			await this.app.vault.createFolder(normalizedPath);
			this.logger?.info("Created folder", { path: normalizedPath });
		}
	}

	/**
	 * Load template for a given type
	 */
	private async loadTemplate(
		type: EntityType,
		customPath?: string
	): Promise<string> {
		let templatePath: string;

		// If custom template path provided, use it
		if (customPath) {
			templatePath = customPath;
		} else {
			// Use default template path from settings (fallback to template folder)
			templatePath = `${this.settings.templateFolder}/canvas-entity-template.md`;
		}

		const file = this.app.vault.getAbstractFileByPath(templatePath);

		if (file instanceof TFile) {
			return await this.app.vault.read(file);
		}

		// Return default template if file not found
		this.logger?.warn("Template not found, using default", {
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
		type: EntityType,
		options?: { alias?: string },
		inProgress?: boolean
	): Promise<void> {
		console.debug('[Canvas Plugin] updateCanvas called:', {
			canvasPath: canvasFile.path,
			notePath,
			existingNodeId,
			effort,
			inProgress
		});

	const color = this.resolveNodeColor(effort, inProgress);
	const metadata = this.buildCanvasMetadata(type, title, effort, options, color);

	console.debug('[Canvas Plugin] ===== START updateCanvas =====');
	console.debug('[Canvas Plugin] Canvas file:', canvasFile.path);
	console.debug('[Canvas Plugin] Note path:', notePath);
	console.debug('[Canvas Plugin] Existing node ID:', existingNodeId);
	console.debug('[Canvas Plugin] Metadata:', metadata);

	// Set flag to prevent deletion detection during our update
	this.isUpdatingCanvas = true;
	console.debug('[Canvas Plugin] isUpdatingCanvas set to true');

	// Always use file-based approach (same as conversion flow) to ensure metadata is set
	console.debug('[Canvas Plugin] Using file-based approach (write + reload)');

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
			console.debug('[Canvas Plugin] Updated existing node:', existingNode.id);
		}
	} else {
		// Create new node at center
		const center = getCanvasCenter(this.app, canvasFile);
		console.debug('[Canvas Plugin] Center position:', center);

		// Ensure valid coordinates
		if (center.x === null || center.y === null || isNaN(center.x) || isNaN(center.y)) {
			console.warn('[Canvas Plugin] Invalid center coordinates, using fallback');
			center.x = 0;
			center.y = 0;
		}

		const newNode: CanvasNode = {
			id: generateNodeId(),
			type: "file",
			file: notePath,
			x: center.x,
			y: center.y,
			width: DEFAULT_NODE_WIDTH,
			height: DEFAULT_NODE_HEIGHT,
			metadata,
			styleAttributes: {},
		};

		if (color) {
			newNode.color = color;
		}

		canvasData.nodes.push(newNode);
		console.debug('[Canvas Plugin] Added new node:', newNode);
	}

	// Save the canvas file
	console.debug('[Canvas Plugin] Saving canvas file...');
	await saveCanvasData(this.app, canvasFile, canvasData);
	console.debug('[Canvas Plugin] Canvas file saved successfully');

	// Don't reload - let Obsidian detect the change and refresh automatically
	console.debug('[Canvas Plugin] Letting Obsidian auto-detect canvas file change');

	// Keep the flag true for a bit to prevent deletion detection during auto-refresh
	setTimeout(() => {
		this.isUpdatingCanvas = false;
		console.debug('[Canvas Plugin] isUpdatingCanvas set to false (delayed)');
	}, 500);

	console.debug('[Canvas Plugin] ===== END updateCanvas =====');
	new Notice("✅ item created and added to canvas!", 4000);
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
		this.logger?.info("Note updated with Notion page ID", { notePath, notionPageId });
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
			this.logger?.info("Notion database initialized", { databaseId });
		} catch (error) {
			this.logger?.error("Failed to initialize Notion database", error);
			new Notice("Failed to initialize Notion database: " + (error as Error).message);
		}
	}

	/**
	 * Sync current note to Notion
	 */
	private async syncCurrentNoteToNotion(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "md") {
			new Notice("No active Markdown note");
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
			new Notice("Notion database not initialized. Run 'initialize Notion database' first.");
			return;
		}

		try {
			// Read and parse frontmatter
			const content = await this.app.vault.read(file);
			const frontmatter = parseFrontmatter(content);

			if (!frontmatter) {
				new Notice("This note does not have valid canvas item frontmatter");
				return;
			}

			// Verify it's a valid entity type
			const validTypes = ['milestone', 'story', 'task', 'decision', 'document'];
			if (!validTypes.includes(frontmatter.type)) {
				new Notice("This note is not a valid entity type");
				return;
			}

			new Notice("Syncing to Notion...");

			const pageId = await this.notionClient.syncNote(frontmatter);

			// Update note with page ID if it was created
			if (!frontmatter.notion_page_id) {
				await this.updateNoteWithNotionId(file.path, pageId);
			}

			new Notice("Successfully synced to Notion");
			this.logger?.info("Sync successful", {
				file: file.path,
				pageId,
			});
		} catch (error) {
			this.logger?.error("Failed to sync note to Notion", error);
			new Notice("Failed to sync to Notion: " + (error as Error).message);
		}
	}

	/**
	 * Sync all notes in the current canvas to Notion (two-pass: pages then dependencies)
	 */
	private async syncAllCanvasNotesToNotion(): Promise<void> {
		if (!this.notionClient || !this.settings.notionEnabled) {
			new Notice("Notion sync is not enabled");
			return;
		}

		if (!this.notionClient.isDatabaseInitialized()) {
			new Notice("Notion database not initialized. Run 'initialize Notion database' first.");
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

			// Find all file nodes that are plugin-created entities
			const fileNodes = canvasData.nodes.filter(
				(node) => node.type === "file" && node.file?.endsWith(".md")
			);

			if (fileNodes.length === 0) {
				new Notice("No Markdown files found in canvas");
				return;
			}

			let syncedCount = 0;
			let skippedCount = 0;
			let errorCount = 0;

			// Maps for dependency sync
			const nodeIdToEntityId: Map<string, string> = new Map();
			const entityIdToNotionPageId: Map<string, string> = new Map();

			new Notice(`Pass 1: Syncing ${fileNodes.length} notes to Notion...`);

			// PASS 1: Sync all pages and build mappings
			for (const node of fileNodes) {
				const file = this.app.vault.getAbstractFileByPath(node.file!);
				if (!(file instanceof TFile)) {
					skippedCount++;
					continue;
				}

				try {
					// Read frontmatter to check if it's a plugin-created entity
					const content = await this.app.vault.read(file);
					const frontmatter = parseFrontmatter(content);

					if (!frontmatter || !frontmatter.created_by_plugin) {
						skippedCount++;
						continue;
					}

					// Build node ID -> entity ID mapping
					if (frontmatter.id) {
						nodeIdToEntityId.set(node.id, frontmatter.id);
					}

					// Sync the file
					const pageId = await this.notionClient.syncNote(frontmatter);

					// Build entity ID -> Notion page ID mapping
					if (frontmatter.id) {
						entityIdToNotionPageId.set(frontmatter.id, pageId);
					}

					// Update note with page ID if it was created
					if (!frontmatter.notion_page_id) {
						await this.updateNoteWithNotionId(file.path, pageId);
					}

					syncedCount++;
				} catch (error) {
					this.logger?.error("Failed to sync note", { file: file.path, error });
					errorCount++;
				}
			}

			// PASS 2: Sync dependencies from canvas edges
			let dependencySyncCount = 0;
			let dependencyErrorCount = 0;

			if (canvasData.edges && canvasData.edges.length > 0) {
				new Notice(`Pass 2: Syncing ${canvasData.edges.length} dependencies...`);

				// Group edges by target node (toNode depends on fromNode)
				const dependenciesByTarget: Map<string, string[]> = new Map();

				for (const edge of canvasData.edges) {
					// In canvas, edge goes from dependency to dependent
					// So toNode depends on fromNode
					const targetNodeId = edge.toNode;
					const dependencyNodeId = edge.fromNode;

					const targetEntityId = nodeIdToEntityId.get(targetNodeId);
					const dependencyEntityId = nodeIdToEntityId.get(dependencyNodeId);

					if (targetEntityId && dependencyEntityId) {
						const deps = dependenciesByTarget.get(targetEntityId) || [];
						deps.push(dependencyEntityId);
						dependenciesByTarget.set(targetEntityId, deps);
					}
				}

				// Update dependencies for each target
				for (const [targetEntityId, dependencyEntityIds] of dependenciesByTarget) {
					const targetPageId = entityIdToNotionPageId.get(targetEntityId);
					if (!targetPageId) continue;

					// Convert entity IDs to Notion page IDs
					const dependencyPageIds = dependencyEntityIds
						.map(id => entityIdToNotionPageId.get(id))
						.filter((id): id is string => id !== undefined);

					if (dependencyPageIds.length > 0) {
						try {
							await this.notionClient.updateDependencies(targetPageId, dependencyPageIds);
							dependencySyncCount++;
						} catch (error) {
							this.logger?.error("Failed to sync dependencies", { targetEntityId, error });
							dependencyErrorCount++;
						}
					}
				}
			}

			const message = `Sync complete: ${syncedCount} pages synced, ${skippedCount} skipped, ${errorCount} errors. Dependencies: ${dependencySyncCount} synced, ${dependencyErrorCount} errors`;
			new Notice(message);
			this.logger?.info("Batch sync complete", { syncedCount, skippedCount, errorCount, dependencySyncCount, dependencyErrorCount });
		} catch (error) {
			this.logger?.error("Failed to sync canvas notes to Notion", error);
			new Notice("Failed to sync canvas notes: " + (error as Error).message);
		}
	}

	/**
	 * Setup CSS styles - creates a CSS snippet in the vault's snippets folder
	 * and enables it in Obsidian's appearance settings
	 */
	async setupStyles(): Promise<void> {
		const snippetsFolder = normalizePath(".obsidian/snippets");
		const snippetPath = normalizePath(`${snippetsFolder}/canvas-project-manager.css`);

		// Ensure snippets folder exists
		const snippetsFolderExists = await this.app.vault.adapter.exists(snippetsFolder);
		if (!snippetsFolderExists) {
			await this.app.vault.adapter.mkdir(snippetsFolder);
			this.logger?.info("Created snippets folder", { path: snippetsFolder });
		}

		// CSS content for the snippet
		const cssContent = `/* Canvas Project Manager - Auto-generated styles */
/* This file is managed by the Canvas Project Manager plugin */

/* Entity type visual indicators */
.canvas-node[data-canvas-pm-type="milestone"] {
    border-width: 3px !important;
    border-style: solid !important;
}

.canvas-node[data-canvas-pm-type="story"] {
    border-width: 2px !important;
    border-style: solid !important;
}

.canvas-node[data-canvas-pm-type="task"] {
    border-width: 1px !important;
}

.canvas-node[data-canvas-pm-type="decision"] {
    border-width: 2px !important;
    border-style: dashed !important;
}

.canvas-node[data-canvas-pm-type="document"] {
    border-width: 1px !important;
    border-style: dotted !important;
}

/* Status indicators - 8px borders, rounded corners, visible when zoomed out */
/* Using higher specificity to override entity type styles */
.canvas-node[data-canvas-pm-type][data-canvas-pm-status="not_started"] {
    opacity: 1;
    border-radius: 12px !important;
}

.canvas-node[data-canvas-pm-type][data-canvas-pm-status="in_progress"] {
    border-color: var(--color-yellow, #ffeb3b) !important;
    border-width: 8px !important;
    border-style: solid !important;
    border-radius: 12px !important;
}

.canvas-node[data-canvas-pm-type][data-canvas-pm-status="completed"],
.canvas-node[data-canvas-pm-type][data-canvas-pm-status="complete"],
.canvas-node[data-canvas-pm-type][data-canvas-pm-status="decided"],
.canvas-node[data-canvas-pm-type][data-canvas-pm-status="approved"] {
    border-color: var(--color-green, #4caf50) !important;
    border-width: 8px !important;
    border-style: solid !important;
    border-radius: 12px !important;
    opacity: 1;
}

.canvas-node[data-canvas-pm-type][data-canvas-pm-status="blocked"] {
    border-color: var(--color-red, #f44336) !important;
    border-width: 8px !important;
    border-style: solid !important;
    border-radius: 12px !important;
    box-shadow: 0 0 16px var(--color-red, #f44336) !important;
}

/* Priority indicators */
.canvas-node[data-canvas-pm-priority="critical"] {
    animation: canvas-pm-pulse 2s infinite;
}

.canvas-node[data-canvas-pm-priority="high"] {
    border-left: 4px solid var(--color-red, #f44336) !important;
}

.canvas-node[data-canvas-pm-priority="medium"] {
    border-left: 4px solid var(--color-yellow, #ffeb3b) !important;
}

.canvas-node[data-canvas-pm-priority="low"] {
    border-left: 4px solid var(--color-green, #4caf50) !important;
}

@keyframes canvas-pm-pulse {
    0%, 100% { box-shadow: 0 0 4px var(--color-red, #f44336); }
    50% { box-shadow: 0 0 12px var(--color-red, #f44336); }
}
`;

		// Check if snippet exists and has same content
		const snippetExists = await this.app.vault.adapter.exists(snippetPath);
		let needsUpdate = true;

		if (snippetExists) {
			const existingContent = await this.app.vault.adapter.read(snippetPath);
			needsUpdate = existingContent !== cssContent;
		}

		if (needsUpdate) {
			await this.app.vault.adapter.write(snippetPath, cssContent);
			this.logger?.info("CSS snippet created/updated", { path: snippetPath });
		}

		// Enable the snippet in Obsidian's config
		await this.enableCssSnippet("canvas-project-manager");
	}

	/**
	 * Enable a CSS snippet in Obsidian's appearance settings
	 */
	async enableCssSnippet(snippetName: string): Promise<void> {
		try {
			const configPath = normalizePath(".obsidian/appearance.json");
			const configExists = await this.app.vault.adapter.exists(configPath);

			let config: { enabledCssSnippets?: string[]; [key: string]: unknown } = {};

			if (configExists) {
				const configContent = await this.app.vault.adapter.read(configPath);
				config = JSON.parse(configContent);
			}

			// Initialize enabledCssSnippets if not present
			if (!config.enabledCssSnippets) {
				config.enabledCssSnippets = [];
			}

			// Add our snippet if not already enabled
			if (!config.enabledCssSnippets.includes(snippetName)) {
				config.enabledCssSnippets.push(snippetName);
				await this.app.vault.adapter.write(configPath, JSON.stringify(config, null, 2));
				this.logger?.info("CSS snippet enabled", { snippet: snippetName });

				// Trigger Obsidian to reload CSS
				// @ts-ignore - customCss is not in the type definitions
				this.app.customCss?.requestLoadSnippets?.();
			}
		} catch (error) {
			this.logger?.warn("Could not enable CSS snippet automatically", { error });
			// Non-fatal - user can enable manually
		}
	}

	/**
	 * Apply visual styles to all open canvas views
	 */
	applyStylesToAllCanvasViews(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view?.getViewType() === "canvas") {
				this.applyStylesToCanvasView(leaf.view);
			}
		});
	}

	/**
	 * Apply data attributes to canvas nodes based on their metadata/frontmatter
	 * This enables CSS styling based on entity type, status, priority, etc.
	 */
	async applyStylesToCanvasView(view: unknown): Promise<void> {
		try {
			// @ts-ignore - canvas view internals
			const canvas = view?.canvas;
			if (!canvas) {
				console.debug("[Canvas Plugin] No canvas object on view");
				return;
			}

			// @ts-ignore - canvas file
			const canvasFile = view?.file as TFile | undefined;
			if (!canvasFile) return;

			// Use canvas internal nodes Map instead of querying DOM
			// @ts-ignore - canvas.nodes is a Map<string, CanvasNode>
			const canvasNodes = canvas.nodes as Map<string, unknown> | undefined;
			if (!canvasNodes) {
				console.debug("[Canvas Plugin] No nodes Map on canvas");
				return;
			}

			let appliedCount = 0;
			for (const [nodeId, canvasNode] of canvasNodes) {
				// @ts-ignore - get the node's DOM element
				const nodeEl = (canvasNode as { nodeEl?: HTMLElement }).nodeEl;
				if (!nodeEl) {
					console.debug("[Canvas Plugin] Node has no nodeEl", { nodeId });
					continue;
				}

				// @ts-ignore - get node data (file path, type, etc.)
				const filePath = (canvasNode as { filePath?: string }).filePath;
				// @ts-ignore
				const unknownData = (canvasNode as { unknownData?: { type?: string; metadata?: Record<string, unknown> } }).unknownData;



				// Apply styles based on node type
				if (filePath) {
					// It's a file node - read frontmatter
					const file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						const applied = await this.applyStylesFromFrontmatter(nodeEl, file);
						if (applied) appliedCount++;
					} else {
						console.debug("[Canvas Plugin] File not found", { path: filePath });
					}
				} else if (unknownData?.type === "text" && unknownData?.metadata) {
					// Text node with metadata
					this.applyStylesFromMetadata(nodeEl, unknownData.metadata);
					appliedCount++;
				}
			}

			console.debug("[Canvas Plugin] Applied styles to canvas nodes", {
				canvas: canvasFile.path,
				nodeCount: canvasNodes.size,
				appliedCount,
			});

			// Now decorate edges with type information from their connected nodes
			// @ts-ignore - canvas.edges is a Map<string, CanvasEdge>
			const canvasEdges = canvas.edges as Map<string, unknown> | undefined;
			if (canvasEdges) {
				// Build a map of nodeId -> entity type for quick lookup
				const nodeTypeMap = new Map<string, string>();
				for (const [nodeId, canvasNode] of canvasNodes) {
					// @ts-ignore
					const nodeEl = (canvasNode as { nodeEl?: HTMLElement }).nodeEl;
					if (nodeEl) {
						const entityType = nodeEl.getAttribute("data-canvas-pm-type");
						if (entityType) {
							nodeTypeMap.set(nodeId, entityType);
						}
					}
				}

				let edgeCount = 0;
				for (const [edgeId, canvasEdge] of canvasEdges) {
					// @ts-ignore - get edge's DOM element and connection info
					const edgeEl = (canvasEdge as { lineGroupEl?: HTMLElement; path?: { display?: HTMLElement } }).lineGroupEl;
					// @ts-ignore
					const fromNode = (canvasEdge as { from?: { node?: { id?: string } } }).from?.node;
					// @ts-ignore
					const toNode = (canvasEdge as { to?: { node?: { id?: string } } }).to?.node;

					if (edgeEl && fromNode?.id && toNode?.id) {
						const fromType = nodeTypeMap.get(fromNode.id) || "unknown";
						const toType = nodeTypeMap.get(toNode.id) || "unknown";

						edgeEl.setAttribute("data-canvas-pm-from-type", fromType);
						edgeEl.setAttribute("data-canvas-pm-to-type", toType);
						edgeCount++;
					}
				}

				console.debug("[Canvas Plugin] Applied styles to canvas edges", {
					edgeCount,
					totalEdges: canvasEdges.size,
				});
			}

			// Create or update the floating control panel
			this.createOrUpdateControlPanel(view);

		} catch (error) {
			console.warn("[Canvas Plugin] Failed to apply styles to canvas view", error);
		}
	}

	/**
	 * Apply data attributes from file frontmatter
	 * Returns true if any attribute was applied
	 */
	async applyStylesFromFrontmatter(el: HTMLElement, file: TFile): Promise<boolean> {
		try {
			const content = await this.app.vault.read(file);
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!frontmatterMatch) {
				console.debug("[Canvas Plugin] No frontmatter found", { file: file.path });
				return false;
			}

			const frontmatterText = frontmatterMatch[1];
			let applied = false;

			// Extract entity ID
			const idMatch = frontmatterText.match(/^id:\s*(.+)$/m);
			if (idMatch) {
				const entityId = idMatch[1].trim();
				el.setAttribute("data-canvas-pm-entity-id", entityId);
				applied = true;
			}

			// Extract type
			const typeMatch = frontmatterText.match(/^type:\s*(.+)$/m);
			if (typeMatch) {
				const entityType = typeMatch[1].trim().toLowerCase();
				el.setAttribute("data-canvas-pm-type", entityType);
				applied = true;
			}

			// Extract status
			const statusMatch = frontmatterText.match(/^status:\s*(.+)$/m);
			if (statusMatch) {
				const status = statusMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
				el.setAttribute("data-canvas-pm-status", status);
				applied = true;
			}

			// Extract priority
			const priorityMatch = frontmatterText.match(/^priority:\s*(.+)$/m);
			if (priorityMatch) {
				const priority = priorityMatch[1].trim().toLowerCase();
				el.setAttribute("data-canvas-pm-priority", priority);
				applied = true;
			}

			// Extract workstream
			const workstreamMatch = frontmatterText.match(/^workstream:\s*(.+)$/m);
			if (workstreamMatch) {
				const workstream = workstreamMatch[1].trim().toLowerCase();
				el.setAttribute("data-canvas-pm-workstream", workstream);
				applied = true;
			}

			return applied;
		} catch (error) {
			console.warn("[Canvas Plugin] Error reading frontmatter", { file: file.path, error });
			return false;
		}
	}

	/**
	 * Apply data attributes from canvas node metadata
	 */
	applyStylesFromMetadata(el: HTMLElement, metadata: Record<string, unknown>): void {
		// Shape often indicates entity type
		if (metadata.shape) {
			const shape = String(metadata.shape).toLowerCase();
			el.setAttribute("data-canvas-pm-type", shape);
		}

		// Direct type if present
		if (metadata.type) {
			el.setAttribute("data-canvas-pm-type", String(metadata.type).toLowerCase());
		}

		// Status
		if (metadata.status) {
			const status = String(metadata.status).toLowerCase().replace(/\s+/g, "_");
			el.setAttribute("data-canvas-pm-status", status);
		}

		// Priority
		if (metadata.priority) {
			el.setAttribute("data-canvas-pm-priority", String(metadata.priority).toLowerCase());
		}

		// Workstream
		if (metadata.workstream) {
			el.setAttribute("data-canvas-pm-workstream", String(metadata.workstream).toLowerCase());
		}
	}

	/**
	 * Create or update the floating control panel for canvas visibility toggles
	 */
	createOrUpdateControlPanel(view: unknown): void {
		// @ts-ignore - canvas view internals
		const containerEl = view?.containerEl as HTMLElement | undefined;
		if (!containerEl) {
			console.debug("[Canvas Plugin] No containerEl on view");
			return;
		}

		// Find the canvas element for applying visibility classes
		const canvasEl = containerEl.querySelector(".canvas-node-container")?.parentElement as HTMLElement | null
			|| containerEl;

		// Find the view-actions area in the header (where other view buttons are)
		const viewHeader = containerEl.closest(".workspace-leaf")?.querySelector(".view-header-right-actions") as HTMLElement | null;

		if (!viewHeader) {
			console.debug("[Canvas Plugin] No view-header-right-actions found, trying alternative");
			// Alternative: append to the container itself as a floating panel
			this.createFloatingPanel(containerEl, canvasEl);
			return;
		}

		// Check if our controls already exist
		const existingControls = viewHeader.querySelector(".canvas-pm-visibility-controls");
		if (existingControls) {
			// Check if Find button exists - if not, recreate controls
			if (existingControls.querySelector(".canvas-pm-find-btn")) {
				// Already exists with Find button, just apply visibility state
				this.applyVisibilityState(canvasEl);
				return;
			}
			// Remove old controls to recreate with Find button
			existingControls.remove();
		}

		console.debug("[Canvas Plugin] Creating visibility controls in view header");

		// Create a container for our visibility toggles
		const controlsContainer = document.createElement("div");
		controlsContainer.className = "canvas-pm-visibility-controls";

		// Create toggle buttons for each entity type
		const types = [
			{ key: "milestones", label: "M", title: "Toggle Milestones" },
			{ key: "stories", label: "S", title: "Toggle Stories" },
			{ key: "tasks", label: "T", title: "Toggle Tasks" },
			{ key: "decisions", label: "De", title: "Toggle Decisions" },
			{ key: "documents", label: "Do", title: "Toggle Documents" },
			{ key: "features", label: "F", title: "Toggle Features" },
		] as const;

		for (const { key, label, title } of types) {
			const btn = document.createElement("button");
			btn.className = `canvas-pm-visibility-btn clickable-icon ${this.visibilityState[key] ? "is-active" : ""}`;
			btn.setAttribute("aria-label", title);
			btn.setAttribute("data-type", key);
			btn.textContent = label;
			btn.title = title;

			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.visibilityState[key] = !this.visibilityState[key];
				btn.classList.toggle("is-active", this.visibilityState[key]);
				this.applyVisibilityState(canvasEl);
				// Update "Hide All" button state
				this.updateHideAllButtonState(controlsContainer);
			});

			controlsContainer.appendChild(btn);
		}

		// Add "Hide All" toggle button
		const hideAllBtn = document.createElement("button");
		hideAllBtn.className = "canvas-pm-visibility-btn canvas-pm-hide-all-btn clickable-icon";
		hideAllBtn.setAttribute("aria-label", "Hide All Entity Types");
		hideAllBtn.setAttribute("data-type", "hide-all");
		hideAllBtn.textContent = "⊘";
		hideAllBtn.title = "Hide All Entity Types";
		hideAllBtn.style.marginLeft = "4px";

		hideAllBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Check if all are currently hidden
			const allHidden = Object.values(this.visibilityState).every(v => !v);
			// Toggle: if all hidden, show all; otherwise hide all
			const newState = allHidden;
			for (const key of Object.keys(this.visibilityState) as Array<keyof typeof this.visibilityState>) {
				this.visibilityState[key] = newState;
			}
			// Update all visibility buttons
			controlsContainer.querySelectorAll(".canvas-pm-visibility-btn[data-type]").forEach(btn => {
				const type = btn.getAttribute("data-type");
				if (type && type !== "hide-all" && type in this.visibilityState) {
					btn.classList.toggle("is-active", this.visibilityState[type as keyof typeof this.visibilityState]);
				}
			});
			this.applyVisibilityState(canvasEl);
			this.updateHideAllButtonState(controlsContainer);
		});

		controlsContainer.appendChild(hideAllBtn);
		this.updateHideAllButtonState(controlsContainer);

		// Add "Find" button for entity search
		const findBtn = document.createElement("button");
		findBtn.className = "canvas-pm-find-btn clickable-icon";
		findBtn.setAttribute("aria-label", "Find Entity on Canvas");
		findBtn.textContent = "🔍";
		findBtn.title = "Find Entity on Canvas";
		findBtn.style.marginLeft = "4px";

		findBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showEntitySearchPopup(findBtn);
		});

		controlsContainer.appendChild(findBtn);

		// Insert at the beginning of view-header-right-actions
		viewHeader.insertBefore(controlsContainer, viewHeader.firstChild);
		this.controlPanelEl = controlsContainer;

		// Apply current visibility state
		this.applyVisibilityState(canvasEl);
	}

	/**
	 * Create a floating panel as fallback when view header is not available
	 */
	private createFloatingPanel(containerEl: HTMLElement, canvasEl: HTMLElement): void {
		// Check if panel already exists
		if (containerEl.querySelector(".canvas-pm-control-panel")) {
			this.applyVisibilityState(canvasEl);
			return;
		}

		const allHidden = Object.values(this.visibilityState).every(v => !v);

		const panel = document.createElement("div");
		panel.className = "canvas-pm-control-panel";
		panel.innerHTML = `
			<div class="canvas-pm-control-header">
				<span>Visibility</span>
				<button class="canvas-pm-hide-all-btn-floating" title="${allHidden ? 'Show All' : 'Hide All'}">${allHidden ? '⊕' : '⊘'}</button>
			</div>
			<div class="canvas-pm-control-toggles">
				<label class="canvas-pm-toggle">
					<input type="checkbox" data-type="milestones" ${this.visibilityState.milestones ? "checked" : ""}>
					<span class="canvas-pm-toggle-label">Milestones</span>
				</label>
				<label class="canvas-pm-toggle">
					<input type="checkbox" data-type="stories" ${this.visibilityState.stories ? "checked" : ""}>
					<span class="canvas-pm-toggle-label">Stories</span>
				</label>
				<label class="canvas-pm-toggle">
					<input type="checkbox" data-type="tasks" ${this.visibilityState.tasks ? "checked" : ""}>
					<span class="canvas-pm-toggle-label">Tasks</span>
				</label>
				<label class="canvas-pm-toggle">
					<input type="checkbox" data-type="decisions" ${this.visibilityState.decisions ? "checked" : ""}>
					<span class="canvas-pm-toggle-label">Decisions</span>
				</label>
				<label class="canvas-pm-toggle">
					<input type="checkbox" data-type="documents" ${this.visibilityState.documents ? "checked" : ""}>
					<span class="canvas-pm-toggle-label">Documents</span>
				</label>
				<label class="canvas-pm-toggle">
					<input type="checkbox" data-type="features" ${this.visibilityState.features ? "checked" : ""}>
					<span class="canvas-pm-toggle-label">Features</span>
				</label>
			</div>
		`;

		// Add event listeners for toggles
		panel.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
			checkbox.addEventListener("change", (e) => {
				const target = e.target as HTMLInputElement;
				const type = target.getAttribute("data-type") as "tasks" | "stories" | "milestones" | "decisions" | "documents" | "features";
				if (type) {
					this.visibilityState[type] = target.checked;
					this.applyVisibilityState(canvasEl);
					this.updateFloatingHideAllButton(panel);
				}
			});
		});

		// Add "Hide All" button listener
		const hideAllBtn = panel.querySelector(".canvas-pm-hide-all-btn-floating");
		if (hideAllBtn) {
			hideAllBtn.addEventListener("click", (e) => {
				e.preventDefault();
				const allHidden = Object.values(this.visibilityState).every(v => !v);
				const newState = allHidden;
				for (const key of Object.keys(this.visibilityState) as Array<keyof typeof this.visibilityState>) {
					this.visibilityState[key] = newState;
				}
				// Update checkboxes
				panel.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
					const type = checkbox.getAttribute("data-type") as keyof typeof this.visibilityState;
					if (type && type in this.visibilityState) {
						(checkbox as HTMLInputElement).checked = this.visibilityState[type];
					}
				});
				this.applyVisibilityState(canvasEl);
				this.updateFloatingHideAllButton(panel);
			});
		}

		// Add "Find" button to the floating panel header
		const headerEl = panel.querySelector(".canvas-pm-control-header");
		if (headerEl) {
			const findBtn = document.createElement("button");
			findBtn.className = "canvas-pm-find-btn-floating";
			findBtn.textContent = "🔍";
			findBtn.title = "Find Entity on Canvas";
			findBtn.style.cssText = "margin-left: 4px; background: none; border: none; cursor: pointer; font-size: 14px;";

			findBtn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.showEntitySearchPopup(findBtn);
			});

			headerEl.appendChild(findBtn);
		}

		containerEl.appendChild(panel);
		this.controlPanelEl = panel;
		this.applyVisibilityState(canvasEl);
	}

	/**
	 * Update the floating panel's "Hide All" button state
	 */
	private updateFloatingHideAllButton(panel: HTMLElement): void {
		const hideAllBtn = panel.querySelector(".canvas-pm-hide-all-btn-floating");
		if (!hideAllBtn) return;
		const allHidden = Object.values(this.visibilityState).every(v => !v);
		hideAllBtn.textContent = allHidden ? "⊕" : "⊘";
		hideAllBtn.setAttribute("title", allHidden ? "Show All" : "Hide All");
	}

	/**
	 * Apply visibility state to canvas by toggling CSS classes
	 */
	applyVisibilityState(canvasEl: HTMLElement | null): void {
		// Find the actual .canvas element - it's the one that contains .canvas-node elements
		const activeLeaf = this.app.workspace.activeLeaf;
		// @ts-ignore
		const containerEl = activeLeaf?.view?.containerEl as HTMLElement | undefined;

		// Try to find the actual canvas element with class "canvas"
		let targetEl = containerEl?.querySelector(".canvas") as HTMLElement | null;
		if (!targetEl) {
			// Fallback to passed element
			targetEl = canvasEl;
		}

		if (!targetEl) {
			console.debug("[Canvas Plugin] No canvas element found for visibility");
			return;
		}

		console.debug("[Canvas Plugin] Applying visibility to element:", {
			tagName: targetEl.tagName,
			className: targetEl.className,
			hasCanvasClass: targetEl.classList.contains("canvas")
		});

		// Toggle classes based on visibility state
		targetEl.classList.toggle("canvas-pm-hide-tasks", !this.visibilityState.tasks);
		targetEl.classList.toggle("canvas-pm-hide-stories", !this.visibilityState.stories);
		targetEl.classList.toggle("canvas-pm-hide-milestones", !this.visibilityState.milestones);
		targetEl.classList.toggle("canvas-pm-hide-decisions", !this.visibilityState.decisions);
		targetEl.classList.toggle("canvas-pm-hide-documents", !this.visibilityState.documents);
		targetEl.classList.toggle("canvas-pm-hide-features", !this.visibilityState.features);

		console.debug("[Canvas Plugin] Applied visibility state", this.visibilityState);
	}

	/**
	 * Remove control panel when leaving canvas view
	 */
	removeControlPanel(): void {
		if (this.controlPanelEl) {
			this.controlPanelEl.remove();
			this.controlPanelEl = null;
		}
	}

	/**
	 * Update the "Hide All" button state based on current visibility
	 */
	private updateHideAllButtonState(container: HTMLElement): void {
		const hideAllBtn = container.querySelector(".canvas-pm-hide-all-btn");
		if (!hideAllBtn) return;
		const allHidden = Object.values(this.visibilityState).every(v => !v);
		hideAllBtn.classList.toggle("is-active", allHidden);
		hideAllBtn.textContent = allHidden ? "⊕" : "⊘";
		hideAllBtn.setAttribute("title", allHidden ? "Show All Entity Types" : "Hide All Entity Types");
	}

	/**
	 * Show entity search popup for finding and zooming to entities on canvas
	 */
	private showEntitySearchPopup(anchorEl: HTMLElement): void {
		// Remove any existing popup
		const existingPopup = document.querySelector(".canvas-pm-search-popup");
		if (existingPopup) {
			existingPopup.remove();
		}

		// Create popup container - centered on screen
		const popup = document.createElement("div");
		popup.className = "canvas-pm-search-popup";
		popup.style.cssText = `
			position: fixed;
			z-index: 1000;
			background: var(--background-primary);
			border: 1px solid var(--background-modifier-border);
			border-radius: 8px;
			padding: 12px;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
			width: 320px;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
		`;

		// Create search input
		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = "Search by ID or name...";
		input.className = "canvas-pm-search-input";
		input.style.cssText = `
			width: 100%;
			padding: 10px 12px;
			border: 1px solid var(--background-modifier-border);
			border-radius: 4px;
			background: var(--background-secondary);
			color: var(--text-normal);
			font-size: 14px;
			outline: none;
			box-sizing: border-box;
		`;

		// Create results container
		const results = document.createElement("div");
		results.className = "canvas-pm-search-results";
		results.style.cssText = `
			max-height: 300px;
			overflow-y: auto;
			margin-top: 8px;
		`;

		popup.appendChild(input);
		popup.appendChild(results);

		document.body.appendChild(popup);

		// Focus input
		input.focus();

		// Get canvas entities for search
		const canvasEntities = this.getCanvasEntitiesForSearch();

		// Handle input changes
		const updateResults = () => {
			const query = input.value.toLowerCase().trim();
			results.innerHTML = "";

			if (!query) {
				results.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 12px;">Type to search...</div>';
				return;
			}

			const matches = canvasEntities.filter(e =>
				e.entityId.toLowerCase().includes(query) ||
				e.title.toLowerCase().includes(query)
			).slice(0, 10); // Limit to 10 results

			if (matches.length === 0) {
				results.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 12px;">No matches found</div>';
				return;
			}

			for (const match of matches) {
				const item = document.createElement("div");
				item.className = "canvas-pm-search-result-item";
				item.style.cssText = `
					padding: 8px 12px;
					cursor: pointer;
					border-radius: 4px;
					display: flex;
					align-items: center;
					gap: 8px;
				`;
				item.innerHTML = `
					<span style="font-weight: 600; color: var(--text-accent); min-width: 60px;">${match.entityId}</span>
					<span style="color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${match.title}</span>
				`;

				item.addEventListener("mouseenter", () => {
					item.style.background = "var(--background-modifier-hover)";
				});
				item.addEventListener("mouseleave", () => {
					item.style.background = "";
				});
				item.addEventListener("click", () => {
					this.zoomToCanvasNode(match.nodeId);
					popup.remove();
				});

				results.appendChild(item);
			}
		};

		input.addEventListener("input", updateResults);
		updateResults();

		// Handle keyboard navigation
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				popup.remove();
			} else if (e.key === "Enter") {
				const firstResult = results.querySelector(".canvas-pm-search-result-item") as HTMLElement;
				if (firstResult) {
					firstResult.click();
				}
			} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				const items = Array.from(results.querySelectorAll(".canvas-pm-search-result-item")) as HTMLElement[];
				if (items.length === 0) return;

				const currentFocused = results.querySelector(".canvas-pm-search-result-focused") as HTMLElement;
				let nextIndex = 0;

				if (currentFocused) {
					currentFocused.classList.remove("canvas-pm-search-result-focused");
					currentFocused.style.background = "";
					const currentIndex = items.indexOf(currentFocused);
					nextIndex = e.key === "ArrowDown"
						? (currentIndex + 1) % items.length
						: (currentIndex - 1 + items.length) % items.length;
				}

				items[nextIndex].classList.add("canvas-pm-search-result-focused");
				items[nextIndex].style.background = "var(--background-modifier-hover)";
				items[nextIndex].scrollIntoView({ block: "nearest" });
			}
		});

		// Close popup when clicking outside
		const closeOnClickOutside = (e: MouseEvent) => {
			if (!popup.contains(e.target as Node) && e.target !== anchorEl) {
				popup.remove();
				document.removeEventListener("click", closeOnClickOutside);
			}
		};
		setTimeout(() => document.addEventListener("click", closeOnClickOutside), 0);
	}

	/**
	 * Get all entities on the current canvas for search
	 */
	private getCanvasEntitiesForSearch(): Array<{ nodeId: string; entityId: string; title: string }> {
		const results: Array<{ nodeId: string; entityId: string; title: string }> = [];

		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) return results;

		// @ts-ignore - canvas view internals
		const canvas = activeLeaf.view?.canvas;
		if (!canvas) return results;

		// @ts-ignore - canvas.nodes is a Map<string, CanvasNode>
		const canvasNodes = canvas.nodes as Map<string, unknown> | undefined;
		if (!canvasNodes) return results;

		for (const [nodeId, canvasNode] of canvasNodes) {
			// @ts-ignore - get node's DOM element
			const nodeEl = (canvasNode as { nodeEl?: HTMLElement }).nodeEl;
			if (!nodeEl) continue;

			const entityId = nodeEl.getAttribute("data-canvas-pm-entity-id");
			if (!entityId) continue;

			// Get title from entity index or use entity ID
			const entity = this.entityIndex?.get(entityId);
			const title = entity?.title || entityId;

			results.push({ nodeId, entityId, title });
		}

		return results;
	}

	/**
	 * Zoom to a specific canvas node by its ID
	 */
	private zoomToCanvasNode(nodeId: string): void {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) return;

		// @ts-ignore - canvas view internals
		const canvas = activeLeaf.view?.canvas;
		if (!canvas) return;

		// @ts-ignore - canvas.nodes is a Map<string, CanvasNode>
		const canvasNodes = canvas.nodes as Map<string, unknown> | undefined;
		if (!canvasNodes) return;

		const canvasNode = canvasNodes.get(nodeId);
		if (!canvasNode) {
			new Notice("Node not found on canvas");
			return;
		}

		// Get node position and size
		// @ts-ignore
		const x = (canvasNode as any).x ?? 0;
		// @ts-ignore
		const y = (canvasNode as any).y ?? 0;
		// @ts-ignore
		const width = (canvasNode as any).width ?? 350;
		// @ts-ignore
		const height = (canvasNode as any).height ?? 250;

		// Calculate bounding box with padding
		const padding = 150;
		const bbox = {
			minX: x - padding,
			minY: y - padding,
			maxX: x + width + padding,
			maxY: y + height + padding,
		};

		// Clear selection and select this node
		// @ts-ignore
		if (typeof canvas.deselectAll === 'function') {
			canvas.deselectAll();
		}
		// @ts-ignore
		if (typeof canvas.addToSelection === 'function') {
			canvas.addToSelection(canvasNode);
		} else if (canvas.selection && typeof canvas.selection.add === 'function') {
			canvas.selection.clear();
			canvas.selection.add(canvasNode);
		}

		// Zoom to the node
		// @ts-ignore
		if (typeof canvas.zoomToBbox === 'function') {
			canvas.zoomToBbox(bbox);
		}
		// @ts-ignore
		else if (typeof canvas.setViewport === 'function') {
			const centerX = (bbox.minX + bbox.maxX) / 2;
			const centerY = (bbox.minY + bbox.maxY) / 2;
			const bboxWidth = bbox.maxX - bbox.minX;
			const bboxHeight = bbox.maxY - bbox.minY;
			const viewWidth = canvas.wrapperEl?.clientWidth ?? 1000;
			const viewHeight = canvas.wrapperEl?.clientHeight ?? 800;
			const zoom = Math.min(viewWidth / bboxWidth, viewHeight / bboxHeight) * 0.9;
			canvas.setViewport(centerX, centerY, zoom);
		}
	}

	/**
	 * Ensure templates exist, creating them if necessary
	 */
	async ensureTemplatesExist(force = false): Promise<void> {
		const templates = [
			{
				path: `${this.settings.templateFolder}/canvas-entity-template.md`,
				content: DEFAULT_ACCOMPLISHMENT_TEMPLATE,
				name: "Entity",
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
					this.logger?.info("Template regenerated", { path: normalizedPath });
				} else {
					await this.app.vault.create(normalizedPath, template.content);
					this.logger?.info("Template created", { path: normalizedPath });
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
				.setTitle("Convert to structured item")
				.setIcon("file-box")
				.onClick(() => {
					void this.convertNoteToStructuredItem(file);
				});
		});

		// Add Entity Navigator submenu
		this.addEntityNavigatorSubmenu(menu, file);
	}

	/**
	 * Add Entity Navigator submenu to context menu
	 */
	private addEntityNavigatorSubmenu(menu: Menu, file: TFile): void {
		if (!this.entityIndex?.isReady()) return;

		const entity = this.entityIndex.getFromFile(file);
		if (!entity) return;

		menu.addSeparator();

		// Parent navigation
		const parent = this.entityIndex.getParent(entity.id);
		menu.addItem((item: MenuItem) => {
			item
				.setTitle(parent ? `Go to Parent: ${parent.title}` : "Go to Parent (none)")
				.setIcon("arrow-up")
				.setDisabled(!parent)
				.onClick(() => parent && this.openEntities([parent]));
		});

		// Children navigation
		const children = this.entityIndex.getChildren(entity.id);
		menu.addItem((item: MenuItem) => {
			item
				.setTitle(`Go to Children (${children.length})`)
				.setIcon("arrow-down")
				.setDisabled(children.length === 0)
				.onClick(() => this.openEntities(children));
		});

		// Dependencies navigation
		const deps = this.entityIndex.getDependencies(entity.id);
		menu.addItem((item: MenuItem) => {
			item
				.setTitle(`Go to Dependencies (${deps.length})`)
				.setIcon("link")
				.setDisabled(deps.length === 0)
				.onClick(() => this.openEntities(deps));
		});

		// Documents navigation
		const docs = this.entityIndex.getImplementedDocuments(entity.id);
		menu.addItem((item: MenuItem) => {
			item
				.setTitle(`Go to Documents (${docs.length})`)
				.setIcon("file-text")
				.setDisabled(docs.length === 0)
				.onClick(() => this.openEntities(docs));
		});

		// Decisions navigation
		const decisions = this.entityIndex.getRelatedDecisions(entity.id);
		menu.addItem((item: MenuItem) => {
			item
				.setTitle(`Go to Decisions (${decisions.length})`)
				.setIcon("scale")
				.setDisabled(decisions.length === 0)
				.onClick(() => this.openEntities(decisions));
		});

		// For decisions: show enabled entities
		if (entity.type === 'decision') {
			const enabled = this.entityIndex.getEnabledEntities(entity.id);
			menu.addItem((item: MenuItem) => {
				item
					.setTitle(`Go to Enabled Entities (${enabled.length})`)
					.setIcon("zap")
					.setDisabled(enabled.length === 0)
					.onClick(() => this.openEntities(enabled));
			});
		}

		// For documents: show implementors
		if (entity.type === 'document') {
			const implementors = this.entityIndex.getImplementors(entity.id);
			menu.addItem((item: MenuItem) => {
				item
					.setTitle(`Go to Implementors (${implementors.length})`)
					.setIcon("git-branch")
					.setDisabled(implementors.length === 0)
					.onClick(() => this.openEntities(implementors));
			});
		}

		// Feature-related menu items
		menu.addSeparator();

		// For features: show implemented_by, documented_by, decided_by
		if (entity.type === 'feature') {
			const implementedBy = (entity as any).implemented_by || [];
			const documentedBy = (entity as any).documented_by || [];
			const decidedBy = (entity as any).decided_by || [];

			menu.addItem((item: MenuItem) => {
				item
					.setTitle(`Implemented By (${implementedBy.length})`)
					.setIcon("check-circle")
					.setDisabled(implementedBy.length === 0)
					.onClick(() => this.navigateToEntityIds(implementedBy));
			});

			menu.addItem((item: MenuItem) => {
				item
					.setTitle(`Documented By (${documentedBy.length})`)
					.setIcon("file-text")
					.setDisabled(documentedBy.length === 0)
					.onClick(() => this.navigateToEntityIds(documentedBy));
			});

			menu.addItem((item: MenuItem) => {
				item
					.setTitle(`Decided By (${decidedBy.length})`)
					.setIcon("scale")
					.setDisabled(decidedBy.length === 0)
					.onClick(() => this.navigateToEntityIds(decidedBy));
			});
		}

		// For non-features: show link to feature option
		if (entity.type !== 'feature') {
			menu.addItem((item: MenuItem) => {
				item
					.setTitle("Link to Feature...")
					.setIcon("star")
					.onClick(() => this.linkCurrentEntityToFeature());
			});

			// Show which features this entity implements/documents/affects
			const implements_ = (entity as any).implements || [];
			const documents_ = (entity as any).documents || [];
			const affects_ = (entity as any).affects || [];
			const allFeatures = [...implements_, ...documents_, ...affects_];

			if (allFeatures.length > 0) {
				menu.addItem((item: MenuItem) => {
					item
						.setTitle(`Go to Features (${allFeatures.length})`)
						.setIcon("star")
						.onClick(() => this.navigateToEntityIds(allFeatures));
				});
			}
		}

		// Open Feature Details panel
		menu.addItem((item: MenuItem) => {
			item
				.setTitle("Open Feature Details Panel")
				.setIcon("layout-sidebar-right")
				.onClick(() => this.activateFeatureDetailsView());
		});
	}

	/**
	 * Navigate to entities by their IDs
	 */
	private async navigateToEntityIds(ids: string[]): Promise<void> {
		if (!this.entityIndex?.isReady()) return;

		const entries: EntityIndexEntry[] = [];
		for (const id of ids) {
			const entry = this.entityIndex.get(id);
			if (entry) entries.push(entry);
		}

		if (entries.length > 0) {
			this.openEntities(entries);
		} else {
			new Notice("No matching entities found");
		}
	}

	/**
	 * Add a selection overlay button to convert text nodes without right-click
	 */
	private setupCanvasSelectionButton(): void {
		console.debug("[Canvas Plugin] Setting up selection watcher");
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
			if (!canvasNode) continue;
			const data = canvasNode.getData?.();
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

	private async createSelectionButton(nodeEl: HTMLElement, canvasNode: InternalCanvasNode): Promise<HTMLElement | null> {
		try {
			// Get node ID from getData() to locate node in file
			const data = canvasNode?.getData?.();
			if (!data?.id) return null;

			// Read node type from canvas file (source of truth)
			const viewFile = canvasNode?.canvas?.view?.file;
			if (!viewFile || !(viewFile instanceof TFile)) {
				return null;
			}

			let nodeInFile: CanvasNode | undefined;
			try {
				const canvasData = await loadCanvasData(this.app, viewFile);
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
			if (nodeEl.querySelector(".canvas-pm-select-btn")) {
				return null;
			}

			const btn = document.createElement("button");
			btn.className = "canvas-pm-select-btn";
			btn.textContent = "Convert";
			// Styles are defined in styles.css

			// Ensure nodeEl can host absolutely-positioned child
			nodeEl.addClass("canvas-pm-node-container");

			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				console.debug("[Canvas Plugin] Selection button clicked for node", data?.id);
				void this.convertCanvasNodeToStructuredItem(canvasNode);
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
					console.debug("[Canvas Plugin] Outside click ignored because isResizing=true");
					this.isResizing = false;
					return;
				}
				console.debug("[Canvas Plugin] Click outside canvas node");
				this.clearInjectedMenuButtons();
				return;
			}

			const canvasNode = wrapped.node;
			const data = canvasNode?.getData?.();
			if (!data) return;

			console.debug("[Canvas Plugin] Canvas node clicked", {
				id: data.id,
				type: data.type,
				file: data.file,
				textPreview: data.text ? String(data.text).split("\n")[0]?.slice(0, 80) : undefined,
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
					console.debug("[Canvas Plugin] isResizing -> false (mouseup)");
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
					console.debug("[Canvas Plugin] Node resized", {
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
					console.debug("[Canvas Plugin] isResizing -> true (detected size change)");
				}
				console.debug("[Canvas Plugin] Node resizing (mousemove)", {
					id,
					oldWidth: prevW,
					oldHeight: prevH,
					newWidth: newW,
					newHeight: newH,
				});
				this.lastPointerNodeSize.width = newW;
				this.lastPointerNodeSize.height = newH;
			}
		});
	}

	private clearInjectedMenuButtons(): void {
		const menus = document.querySelectorAll<HTMLElement>(".canvas-card-menu");
		menus.forEach((menu) => {
			menu
				.querySelectorAll(
					".canvas-pm-select-menu, .canvas-pm-open-menu"
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
	private async addSelectionMenuButton(canvasNode: InternalCanvasNode): Promise<void> {
		try {
			// Get node ID from getData() - we need this to locate the node in the file
			const data = canvasNode?.getData?.();
			if (!data || !data.id) {
				console.debug("[Canvas Plugin] No data found for node");
				return;
			}

			// Read ALL node data from canvas file (source of truth)
			// getData() may be stale, especially after conversions
			let nodeInFile: CanvasNode | undefined;
			const viewFile = canvasNode?.canvas?.view?.file;
			if (!viewFile || !(viewFile instanceof TFile)) {
				console.debug("[Canvas Plugin] Cannot access canvas file");
				return;
			}

			try {
				const canvasData = await loadCanvasData(this.app, viewFile);
				nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === data.id);

				if (!nodeInFile) {
					console.debug("[Canvas Plugin] Node not found in canvas file:", data.id);
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

			console.debug("[Canvas Plugin] Determining mode for node:", {
				id: nodeInFile.id,
				type: nodeType,
				hasMetadata: !!metadata,
				plugin: metadata?.plugin,
			});

			// Determine which button to inject based on node type
			let mode: "convert" | "open" | null = null;
			if (nodeType === "text") {
				mode = "convert";
			} else if (nodeType === "file" && nodeInFile.file) {
				// Check if it's a plugin-created note by checking canvas metadata OR MD frontmatter
				const hasPluginMetadata = metadata?.plugin === "canvas-project-manager" || metadata?.plugin === "structured-canvas-notes";
				const isPluginFile = await this.isPluginCreatedFile(nodeInFile.file);

				if (hasPluginMetadata || isPluginFile) {
					mode = "open";
				} else {
					// Regular file node, don't show any buttons
					console.debug("[Canvas Plugin] File node is not plugin-created, skipping");
					return;
				}
			}

			if (!mode) {
				console.debug("[Canvas Plugin] No mode determined for node type:", data.type);
				return;
			}

			const menus = document.querySelectorAll<HTMLElement>(".canvas-card-menu");
			let visibleMenu: HTMLElement | null = null;
			for (let i = 0; i < menus.length; i++) {
				const el = menus[i];
				const style = window.getComputedStyle(el);
				if (style.display !== "none" && style.visibility !== "hidden") {
					visibleMenu = el;
					break;
				}
			}

			if (!visibleMenu) {
				console.debug("[Canvas Plugin] No visible selection menu found for node", nodeInFile.id);
				return;
			}

			// Remove previous injected buttons to avoid stale callbacks or duplicates
			visibleMenu
				.querySelectorAll(
					".canvas-pm-select-menu, .canvas-pm-open-menu"
				)
				.forEach((el) => el.remove());

			console.debug("[Canvas Plugin] Injecting selection menu buttons for node", nodeInFile.id, "mode", mode);

			if (mode === "convert") {
				const convertButton = this.buildMenuButton(
					"canvas-pm-select-menu",
					"Convert",
					async () => this.convertCanvasNodeToStructuredItem(canvasNode),
					canvasNode
				);
				visibleMenu.appendChild(convertButton);
			} else if (mode === "open" && nodeInFile.file) {
				// Capture file path at button creation time (clicking button deselects node)
				const filePath = nodeInFile.file;
				const openButton = this.buildMenuButton(
					"canvas-pm-open-menu",
					"Open",
					async () => {
						console.debug("[Canvas Plugin] Open button clicked, opening file:", filePath);
						await this.openCanvasFileNode(filePath);
					},
					canvasNode
				);
				visibleMenu.appendChild(openButton);
			}
		} catch (error) {
			console.error("[Canvas Plugin] Failed to add selection menu button", error);
		}
	}

	private buildMenuButton(
		className: string,
		labelText: string,
		onClick: () => void | Promise<void>,
		canvasNode: InternalCanvasNode
	): HTMLElement {
		const item = document.createElement("div");
		item.className = `${className} clickable-icon canvas-pm-menu-item`;

		const iconDiv = document.createElement("div");
		iconDiv.addClass("canvas-pm-menu-icon");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "16");
		svg.setAttribute("height", "16");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");

		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", "M14.5 22H18a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4");
		svg.appendChild(path);

		const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
		polyline.setAttribute("points", "14 2 14 8 20 8");
		svg.appendChild(polyline);

		const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		circle.setAttribute("cx", "7");
		circle.setAttribute("cy", "14");
		circle.setAttribute("r", "3");
		svg.appendChild(circle);

		iconDiv.appendChild(svg);
		item.appendChild(iconDiv);

		const label = document.createElement("span");
		label.textContent = labelText;
		item.appendChild(label);

		item.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			void (async () => {
				await onClick();
				// Rebuild menu immediately to refresh labels
				await this.addSelectionMenuButton(canvasNode);
			})();
		});

		return item;
	}

	private async openCanvasFileNode(filePath?: string): Promise<void> {
		try {
			if (!filePath) {
				console.debug("[Canvas Plugin] No file path to open");
				return;
			}
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				console.debug("[Canvas Plugin] File not found", filePath);
				return;
			}
			const workspace = this.app.workspace;
			const existingLeaf = workspace.getLeavesOfType("markdown").find((leaf) => {
				const view = leaf.view as InternalCanvasView;
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
				const viewFile = canvasNode?.canvas?.view?.file;
				if (!data?.id || !viewFile || !(viewFile instanceof TFile)) continue;

				try {
					const canvasData = await loadCanvasData(this.app, viewFile);
					const nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === data.id);

					// Only include plugin-created file nodes (check MD frontmatter)
					if (nodeInFile?.type === "file" && nodeInFile?.file) {
						console.debug("[Canvas Plugin] Checking if file is plugin-created:", nodeInFile.file);
						const isPlugin = await this.isPluginCreatedFile(nodeInFile.file);
						console.debug("[Canvas Plugin] isPluginCreatedFile result:", isPlugin);
						if (isPlugin) {
							filePaths.push(nodeInFile.file);
						}
					} else {
						console.debug("[Canvas Plugin] Node not a file or no file path:", {
							type: nodeInFile?.type,
							file: nodeInFile?.file
						});
					}
				} catch (err) {
					console.error("[Canvas Plugin] Failed to read node from canvas file:", err);
				}
			}

			console.debug("[Canvas Plugin] Opening", filePaths.length, "files in separate tabs");

			// Open each file in a new tab
			for (const filePath of filePaths) {
				await this.openCanvasFileNode(filePath);
			}
		} catch (error) {
			console.error("[Canvas Plugin] Failed to open selected file nodes", error);
		}
	}

	private getSelectedCanvasTextNode(): InternalCanvasNode | null {
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

	private getSelectedCanvasFileNode(): InternalCanvasNode | null {
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
			console.debug("[Canvas Plugin] No selected text node to convert");
			return;
		}
		await this.convertCanvasNodeToStructuredItem(node);
	}


	/**
	 * Setup canvas node context menu using DOM events
	 */
	private setupCanvasNodeContextMenu(): void {
		// Store current node for menu actions
		let currentContextNode: InternalCanvasNode | null = null;
		
		// Use contextmenu event on document to catch all right-clicks
		this.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
			// Check if click is on a canvas node
			const target = evt.target as HTMLElement;
			const nodeEl = target.closest('.canvas-node') as HTMLElement;
			
			if (nodeEl) {
				console.debug('[Canvas Plugin] Right-click detected on canvas node');
				
				// Find and store the actual node object
				currentContextNode = this.findCanvasNodeByElement(nodeEl);

				if (!currentContextNode) {
					console.debug('[Canvas Plugin] Could not find node object');
					return;
				}

				const nodeRef = currentContextNode;
				console.debug('[Canvas Plugin] Stored node reference:', nodeRef.getData?.()?.id);

				// Wait for menu to appear, then add our item
				setTimeout(() => this.addCanvasNodeMenuItemToDOM(nodeRef).catch(err =>
					console.error('[Canvas Plugin] Failed to add menu item:', err)
				), 50);
				setTimeout(() => this.addCanvasNodeMenuItemToDOM(nodeRef).catch(err =>
					console.error('[Canvas Plugin] Failed to add menu item:', err)
				), 100);
			}
		});

		console.debug('[Canvas Plugin] Canvas node context menu setup complete');
	}

	/**
	 * Find canvas node object by its DOM element
	 */
	private findCanvasNodeByElement(nodeEl: HTMLElement): InternalCanvasNode | null {
		const leaves = this.app.workspace.getLeavesOfType("canvas");

		for (const leaf of leaves) {
			const canvasView = leaf.view as { canvas?: InternalCanvas };
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
	private async addCanvasNodeMenuItemToDOM(targetNode: InternalCanvasNode): Promise<void> {
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
				console.debug('[Canvas Plugin] No visible canvas-card-menu found');
				return;
			}

			// Check if we already added our item to THIS menu
			if (menuEl.querySelector('.canvas-pm-convert')) {
				console.debug('[Canvas Plugin] Menu item already exists in this menu');
				return;
			}

			// Get node ID from getData() to locate node in file
			const nodeData = targetNode.getData?.();
			if (!nodeData?.id) {
				console.debug('[Canvas Plugin] No node ID found');
				return;
			}

			// Read node type from canvas file (source of truth)
			const viewFile = targetNode?.canvas?.view?.file;
			if (!viewFile || !(viewFile instanceof TFile)) {
				console.debug('[Canvas Plugin] Cannot access canvas file');
				return;
			}

			let nodeInFile: CanvasNode | undefined;
			try {
				const canvasData = await loadCanvasData(this.app, viewFile);
				nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === nodeData.id);

				if (!nodeInFile) {
					console.debug('[Canvas Plugin] Node not found in canvas file:', nodeData.id);
					return;
				}
			} catch (err) {
				console.error('[Canvas Plugin] Failed to read from canvas file:', err);
				return;
			}

			// Only show menu item for text nodes
			if (nodeInFile.type !== "text") {
				console.debug('[Canvas Plugin] Not a text node, type:', nodeInFile.type);
				return;
			}

			console.debug('[Canvas Plugin] Adding menu item for text node:', nodeInFile.id);

			// Find existing menu items to match their style
			const existingItems = menuEl.querySelectorAll('div[class*="clickable"]');
			let itemClass = 'clickable-icon';
			if (existingItems.length > 0) {
				itemClass = (existingItems[0] as HTMLElement).className;
			}

			// Create our menu item matching Obsidian's style
			const item = document.createElement('div');
			item.className = itemClass + ' canvas-pm-convert';
			// Styles are inherited from the itemClass which matches Obsidian's native menu items

			item.setAttribute('aria-label', 'Convert to structured item');

			// Create icon using setIcon from Obsidian API would be better, but for SVG:
			const iconDiv = document.createElement('div');
			iconDiv.addClass('canvas-pm-menu-icon');
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('width', '18');
			svg.setAttribute('height', '18');
			svg.setAttribute('viewBox', '0 0 24 24');
			svg.setAttribute('fill', 'none');
			svg.setAttribute('stroke', 'currentColor');
			svg.setAttribute('stroke-width', '2');
			svg.setAttribute('stroke-linecap', 'round');
			svg.setAttribute('stroke-linejoin', 'round');

			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', 'M14.5 22H18a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4');
			svg.appendChild(path);

			const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
			polyline.setAttribute('points', '14 2 14 8 20 8');
			svg.appendChild(polyline);

			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', '7');
			circle.setAttribute('cy', '14');
			circle.setAttribute('r', '3');
			svg.appendChild(circle);

			iconDiv.appendChild(svg);
			item.appendChild(iconDiv);

			// Add click handler with the correct node reference
			item.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();

				console.debug('[Canvas Plugin] Menu item clicked, converting node:', targetNode.getData?.()?.id);

				// Close the menu by hiding it
				menuEl?.addClass('is-hidden');

				// Convert the node (use the captured targetNode, not a lookup)
				void this.convertCanvasNodeToStructuredItem(targetNode);
			});
			
			// Add to menu
			menuEl.appendChild(item);

			console.debug('[Canvas Plugin] Added context menu item');
		} catch (error) {
			console.error('[Canvas Plugin] Failed to add context menu item:', error);
		}
	}

	/**
	 * Convert an existing note to a structured item
	 */
	private async convertNoteToStructuredItem(file: TFile): Promise<void> {
		try {
			this.logger?.info("Conversion flow invoked (note to structured item)", {
				path: file.path,
			});
			const content = await this.app.vault.read(file);
			const { frontmatter, body } = parseFrontmatterAndBody(content);

		// Show modal to get item details
		const fileNameWithoutExt = file.basename;
		const modalOptions: StructuredItemModalOptions = {
			showTitleInput: false,
			showAliasInput: true,
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
			this.logger?.error("Failed to convert note", error);
			new Notice("Failed to convert note: " + (error as Error).message);
		}
	}

	/**
	 * Perform the actual note conversion
	 */
	private async performNoteConversion(
		file: TFile,
		result: ConvertNoteResult,
		existingFrontmatter: Partial<ItemFrontmatter>,
		body: string
	): Promise<void> {
		try {
			// Generate ID based on entity type
			const id = generateId(this.app, this.settings, result.type);

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
					existingFrontmatter.priority || "Medium"
				),
				depends_on: existingFrontmatter.depends_on || [],
				created_by_plugin: existingFrontmatter.created_by_plugin ?? true,
				created: existingFrontmatter.created || now,
				updated: now,
				canvas_source: existingFrontmatter.canvas_source || "",
				vault_path: existingFrontmatter.vault_path || file.path,
			};

			// Update note content
			const newContent = createWithFrontmatter(body, newFrontmatter);

			// Update content
			await this.app.vault.modify(file, newContent);

			new Notice(`✅ Converted to ${result.type}: ${id}`);
			this.logger?.info("Note converted", { oldPath: file.path, newPath, id });

			// Sync to Notion if enabled
			if (this.shouldSyncOnCreate()) {
				const updatedFile = this.app.vault.getAbstractFileByPath(newPath);
				if (updatedFile instanceof TFile) {
					await this.syncFileToNotion(updatedFile);
				}
			}
		} catch (error) {
			this.logger?.error("Failed to perform note conversion", error);
			new Notice("Failed to convert note: " + (error as Error).message);
		}
	}

	/**
	 * Convert a canvas text node to a structured item file
	 */
	private async convertCanvasNodeToStructuredItem(node: InternalCanvasNode): Promise<void> {
		try {
			// Get node ID from getData() - we need this to locate the node in the file
			const nodeData = node.getData();
			if (!nodeData?.id) {
				console.debug('[Canvas Plugin] No node ID found');
				return;
			}

			const canvasView = node.canvas?.view;
			const canvasFile = canvasView?.file;

			if (!canvasFile || !(canvasFile instanceof TFile)) {
				new Notice("Could not find canvas file");
				return;
			}

			// Read node data from canvas file (source of truth)
			let nodeInFile: CanvasNode | undefined;
			try {
				const canvasData = await loadCanvasData(this.app, canvasFile);
				nodeInFile = canvasData.nodes.find((n: CanvasNode) => n.id === nodeData.id);
				
				if (!nodeInFile) {
					console.debug('[Canvas Plugin] Node not found in canvas file:', nodeData.id);
					return;
				}
			} catch (err) {
				console.error('[Canvas Plugin] Failed to read from canvas file:', err);
				return;
			}

			console.debug('[Canvas Plugin] convertCanvasNodeToStructuredItem called for node:', {
				id: nodeInFile.id,
				type: nodeInFile.type,
				hasMetadata: !!nodeInFile.metadata,
				plugin: nodeInFile.metadata?.plugin,
			});
			
			// Check if node is already converted (check MD frontmatter)
			if (nodeInFile.type === "file" && nodeInFile.file) {
				const isPlugin = await this.isPluginCreatedFile(nodeInFile.file);
				if (isPlugin) {
					console.debug('[Canvas Plugin] Node is already converted, skipping conversion');
					new Notice("This note is already a structured item");
					return;
				}
			}
			
			// Only allow conversion of text nodes
			if (nodeInFile.type !== "text") {
				console.debug('[Canvas Plugin] Node is not a text node, cannot convert:', nodeInFile.type);
				new Notice("Only text nodes can be converted to structured items");
				return;
			}
			
			this.logger?.info("Conversion flow invoked (canvas text node to structured item)", {
				nodeId: nodeInFile.id,
			});

		// Get node text as title (from file)
		const nodeText = nodeInFile.text || "Untitled";
		const title = nodeText.split('\n')[0].substring(0, 100); // First line, max 100 chars

		// Show modal to get item details
		const modalOptions: StructuredItemModalOptions = {
			showTitleInput: false,
			showAliasInput: true,
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
			this.logger?.error("Failed to convert canvas node", error);
			new Notice("Failed to convert canvas node: " + (error as Error).message);
		}
	}

	/**
	 * Perform canvas node conversion or creation
	 * If node exists, converts it; if node is null but nodeId provided, finds and converts it; if neither, creates a new node
	 */
	private async performCanvasNodeConversion(
		node: InternalCanvasNode | null,
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
				console.debug('[Canvas Plugin] Using existing note path:', notePath);

				// Read ID from existing file's frontmatter
				const existingFile = this.app.vault.getAbstractFileByPath(notePath);
				if (existingFile instanceof TFile) {
					const fileContent = await this.app.vault.read(existingFile);
					const parsed = parseFrontmatter(fileContent);
					id = parsed?.id || generateId(this.app, this.settings, result.type);
					console.debug('[Canvas Plugin] Read ID from existing file:', id);
				} else {
					id = generateId(this.app, this.settings, result.type);
				}
			} else {
				// Generate new path (conversion flow)
				id = generateId(this.app, this.settings, result.type);
				const baseFolder = canvasFile.parent?.path || this.settings.notesBaseFolder;
				// Use title as filename, preserving whitespaces
				notePath = generateUniqueFilename(
					this.app,
					baseFolder,
					title,
					"md"
				);
				console.debug('[Canvas Plugin] Generated new note path:', notePath);
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
					depends_on: [],
					created_by_plugin: true,
					created: now,
					updated: now,
					canvas_source: canvasFile.path,
					vault_path: notePath,
					notion_page_id: undefined,
				};

				// Load template and replace placeholders
				const template = await this.loadTemplate(result.type);
				const content = replacePlaceholders(template, frontmatter);

				console.debug('[Canvas Plugin] Creating note with content preview:', {
					firstLines: content.split('\n').slice(0, 10).join('\n'),
					hasFrontmatter: content.startsWith('---'),
					totalLines: content.split('\n').length
				});

				await this.app.vault.create(notePath, content);
				this.logger?.info("Note created from canvas node", { path: notePath });
			} else {
				console.debug('[Canvas Plugin] Note file already exists, skipping creation:', notePath);
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
				console.debug('[Canvas Plugin] Converting existing node in-place (keeping same ID)');

				existingNode.type = "file";
				existingNode.file = notePath;
				if (color) {
					existingNode.color = color;
				}
				existingNode.metadata = this.buildCanvasMetadata(
					result.type,
					title,
					result.effort,
					{ alias },
					color
				);
				existingNode.height = DEFAULT_NODE_HEIGHT;
				existingNode.width = DEFAULT_NODE_WIDTH;
				// Remove text property
				delete existingNode.text;
				// Ensure styleAttributes exists for consistency
				if (!existingNode.styleAttributes) {
					existingNode.styleAttributes = {};
				}

				console.debug('[Canvas Plugin] Node transformed:', {
					id: existingNode.id,
					type: existingNode.type,
					file: existingNode.file,
					color: existingNode.color
				});

				// Edges automatically remain valid (same node ID)
				const connectedEdges = canvasData.edges.filter((edge: CanvasEdge) =>
					edge.fromNode === resolvedNodeId || edge.toNode === resolvedNodeId
				);
				console.debug('[Canvas Plugin]', connectedEdges.length, 'edges remain connected (no update needed)');
			} else {
				// Create new node (fallback when node not found)
				console.debug('[Canvas Plugin] Node not found, creating new node');

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
					{ alias },
					color
				);

				// Create new node
				const newNode: CanvasNode = {
					id: generateNodeId(),
					type: "file",
					file: notePath,
					x: center.x,
					y: center.y,
					width: DEFAULT_NODE_WIDTH,
					height: DEFAULT_NODE_HEIGHT,
					metadata,
					styleAttributes: {},
				};

				if (color) {
					newNode.color = color;
				}

				canvasData.nodes.push(newNode);
				console.debug('[Canvas Plugin] Added new node:', newNode);
			}
			
			// Unified save logic for both conversion and creation
			console.debug('[Canvas Plugin] Saving canvas file...');
			await saveCanvasData(this.app, canvasFile, canvasData);
			console.debug('[Canvas Plugin] Canvas file saved');

			// Force reload canvas to sync Obsidian's in-memory state with file
			// This ensures the node renders properly with file content preview
			console.debug('[Canvas Plugin] Reloading canvas to sync in-memory state...');
			await reloadCanvasViewsWithViewport(this.app, canvasFile);
			console.debug('[Canvas Plugin] Canvas reloaded');

			// Update cache after reload (re-read from file to ensure consistency)
			const reloadedCanvasData = await loadCanvasData(this.app, canvasFile);
			const currentNodeIds = new Set(reloadedCanvasData.nodes.map((n) => n.id));
			this.canvasNodeCache.set(canvasFile.path, currentNodeIds);
			console.debug('[Canvas Plugin] Cache updated with', currentNodeIds.size, 'nodes');

			// Keep flag true longer to prevent deletion detection during auto-refresh
			setTimeout(() => {
				this.isUpdatingCanvas = false;
				console.debug('[Canvas Plugin] isUpdatingCanvas set to false (delayed, conversion flow)');
			}, 500);
			
			// Log completion
			if (existingNode) {
				this.logger?.info("Canvas node converted in-place", {
					nodeId: resolvedNodeId,
					path: notePath,
				});
				new Notice(`✅ Converted to ${result.type}: ${id}`);
			} else {
				this.logger?.info("Canvas node created", {
					path: notePath,
				});
				new Notice(`✅ Created ${result.type}: ${id}`);
			}

			// Refresh the selection menu buttons after conversion
			// Wait a bit for the canvas to update, then refresh the menu
			setTimeout(() => {
				// Clear old menu buttons first
				this.clearInjectedMenuButtons();
				// Re-inject menu buttons for the converted node
				if (node) {
					void this.addSelectionMenuButton(node);
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
			this.logger?.error("Failed to perform canvas node conversion", error);
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
		type: EntityType,
		title: string,
		effort?: string,
		options?: { alias?: string },
		effortColor?: string
	): CanvasNode["metadata"] {
		const metadata: CanvasNode["metadata"] = {
			plugin: "canvas-project-manager",
			alias: options?.alias ?? title,
			shape: "entity",
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
			console.debug('[Canvas Plugin] Initializing canvas node cache...');
			const canvasFiles = this.app.vault.getFiles().filter(f => f.extension === "canvas");
			console.debug('[Canvas Plugin] Found', canvasFiles.length, 'canvas files:', canvasFiles.map(f => f.path));

			for (const canvasFile of canvasFiles) {
				const canvasData = await loadCanvasData(this.app, canvasFile);
				console.debug('[Canvas Plugin] Canvas data for', canvasFile.path, ':', {
					nodeCount: canvasData.nodes?.length ?? 0,
					edgeCount: canvasData.edges?.length ?? 0,
					nodes: canvasData.nodes?.map((n: CanvasNode) => ({ id: n.id, type: n.type, file: n.file }))
				});
				const nodeIds = new Set(canvasData.nodes.map((n) => n.id));
				this.canvasNodeCache.set(canvasFile.path, nodeIds);
				console.debug('[Canvas Plugin] Initialized cache for', canvasFile.path, 'with', nodeIds.size, 'nodes');
			}
			console.debug('[Canvas Plugin] Cache initialization complete. Total cached canvases:', this.canvasNodeCache.size);
		} catch (error) {
			console.error('[Canvas Plugin] Failed to initialize canvas node cache:', error);
			this.logger?.error("Failed to initialize canvas node cache", error);
		}
	}

	/**
	 * Initialize cache of file path -> entity ID for deletion sync
	 */
	private async initializeFileEntityIdCache(): Promise<void> {
		try {
			console.debug('[Canvas Plugin] Initializing file entity ID cache...');
			const mdFiles = this.app.vault.getMarkdownFiles();
			let cachedCount = 0;

			for (const file of mdFiles) {
				try {
					const content = await this.app.vault.read(file);
					const frontmatter = parseFrontmatter(content);

					if (frontmatter && isPluginCreatedNote(frontmatter) && frontmatter.id) {
						this.fileEntityIdCache.set(file.path, frontmatter.id);
						cachedCount++;
					}
				} catch (error) {
					// Skip files that can't be read
				}
			}

			console.debug('[Canvas Plugin] File entity ID cache initialized with', cachedCount, 'entries');
		} catch (error) {
			console.error('[Canvas Plugin] Failed to initialize file entity ID cache:', error);
			this.logger?.error("Failed to initialize file entity ID cache", error);
		}
	}

	private async handleCanvasModification(canvasFile: TFile): Promise<void> {
		console.debug('[Canvas Plugin] ===== Canvas modification detected =====');
		console.debug('[Canvas Plugin] Canvas file:', canvasFile.path);
		console.debug('[Canvas Plugin] isUpdatingCanvas flag:', this.isUpdatingCanvas);
	
		// Skip if we're currently updating the canvas ourselves
		if (this.isUpdatingCanvas) {
			console.debug('[Canvas Plugin] Skipping modification handler - we are updating');
			return;
		}
		
		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			console.debug('[Canvas Plugin] Loaded canvas data:', {
				nodeCount: canvasData.nodes?.length ?? 0,
				nodes: canvasData.nodes?.map((n: CanvasNode) => ({ id: n.id, type: n.type, file: n.file }))
			});

			const currentNodeIds = new Set(canvasData.nodes.map((n) => n.id));
			const currentFileNodes = new Set(
				canvasData.nodes
					.filter((n) => n.type === "file" && n.file)
					.map((n) => n.file!)
			);

			console.debug('[Canvas Plugin] Current node IDs:', Array.from(currentNodeIds));
			console.debug('[Canvas Plugin] Current file nodes:', Array.from(currentFileNodes));

			// Get previously cached nodes
			const cachedNodeIds = this.canvasNodeCache.get(canvasFile.path) || new Set();
			console.debug('[Canvas Plugin] Cached node IDs:', Array.from(cachedNodeIds));

			// Find deleted nodes (only if cache was previously populated)
			const deletedNodeIds = Array.from(cachedNodeIds).filter((id) => !currentNodeIds.has(id));

			if (deletedNodeIds.length > 0 && cachedNodeIds.size > 0) {
				// Only check for deletions if cache was populated (not first load)
				console.debug('[Canvas Plugin] Detected', deletedNodeIds.length, 'deleted nodes');

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
				console.debug('[Canvas Plugin] Cache was empty, initializing with current nodes');
			}

			// Update cache
			this.canvasNodeCache.set(canvasFile.path, currentNodeIds);
			console.debug('[Canvas Plugin] Cache updated with', currentNodeIds.size, 'nodes');

			// Trigger edge sync (debounced) to update depends_on in MD files
			this.scheduleEdgeSync(canvasFile);
		} catch (error) {
			this.logger?.error("Failed to handle canvas modification", error);
		}
	}

	/**
	 * Schedule edge sync for a canvas file (debounced)
	 * This batches rapid edge changes into a single sync operation
	 */
	private scheduleEdgeSync(canvasFile: TFile): void {
		// Clear existing timer for this canvas
		const existingTimer = this.edgeSyncDebounceTimers.get(canvasFile.path);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Set new timer (500ms debounce)
		const timer = setTimeout(() => {
			this.edgeSyncDebounceTimers.delete(canvasFile.path);
			void this.syncEdgesToMdFiles(canvasFile);
		}, 500);

		this.edgeSyncDebounceTimers.set(canvasFile.path, timer);
	}

	/**
	 * Check if a file is a plugin-created note by reading its frontmatter
	 */
	private async isPluginCreatedFile(filePath: string): Promise<boolean> {
		console.debug('[Canvas Plugin] isPluginCreatedFile checking:', filePath);
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			console.debug('[Canvas Plugin] isPluginCreatedFile: not a TFile');
			return false;
		}
		try {
			const content = await this.app.vault.read(file);
			const frontmatter = parseFrontmatter(content);
			const result = frontmatter !== null && isPluginCreatedNote(frontmatter);
			console.debug('[Canvas Plugin] isPluginCreatedFile result:', {
				hasFrontmatter: frontmatter !== null,
				frontmatterKeys: frontmatter ? Object.keys(frontmatter) : [],
				type: frontmatter?.type,
				id: frontmatter?.id,
				canvas_source: frontmatter?.canvas_source,
				result
			});
			return result;
		} catch (err) {
			console.debug('[Canvas Plugin] isPluginCreatedFile error:', err);
			return false;
		}
	}

	/**
	 * Sync canvas edges to MD file depends_on fields
	 * Reads all edges from canvas, computes dependencies for each node,
	 * and updates the depends_on field in each affected MD file
	 */
	private async syncEdgesToMdFiles(canvasFile: TFile): Promise<void> {
		console.debug('[Canvas Plugin] ===== Syncing edges to MD files =====');
		console.debug('[Canvas Plugin] Canvas:', canvasFile.path);

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);

			// Build map: nodeId -> node (for quick lookup)
			const nodeMap = new Map<string, CanvasNode>();
			for (const node of canvasData.nodes) {
				nodeMap.set(node.id, node);
			}

			// Build map: targetFilePath -> [dependencyAccomplishmentIds]
			const dependenciesByFile = new Map<string, string[]>();

			// Also track all plugin files in this canvas (to clear deps for files with no incoming edges)
			// Check actual frontmatter instead of relying on canvas metadata
			const allPluginFiles = new Set<string>();

			for (const node of canvasData.nodes) {
				if (node.type === 'file' && node.file) {
					const isPlugin = await this.isPluginCreatedFile(node.file);
					if (isPlugin) {
						allPluginFiles.add(node.file);
					}
				}
			}

			console.debug('[Canvas Plugin] Found plugin files:', Array.from(allPluginFiles));

			// Process each edge
			for (const edge of canvasData.edges || []) {
				const fromNode = nodeMap.get(edge.fromNode);
				const toNode = nodeMap.get(edge.toNode);

				// Skip if either node doesn't exist
				if (!fromNode || !toNode) {
					continue;
				}

				// Skip if either node is not a file node
				if (fromNode.type !== 'file' || toNode.type !== 'file') {
					continue;
				}
				if (!fromNode.file || !toNode.file) {
					continue;
				}

				// Skip if either file is not a plugin-created note
				if (!allPluginFiles.has(fromNode.file) || !allPluginFiles.has(toNode.file)) {
					continue;
				}

				// Get the entity ID of the dependency (fromNode)
				const fromFile = this.app.vault.getAbstractFileByPath(fromNode.file);
				if (!(fromFile instanceof TFile)) {
					continue;
				}

				const fromContent = await this.app.vault.read(fromFile);
				const fromFrontmatter = parseFrontmatter(fromContent);
				if (!fromFrontmatter?.id) {
					continue;
				}

				// Add to dependencies for the target file (toNode)
				const deps = dependenciesByFile.get(toNode.file) || [];
				if (!deps.includes(fromFrontmatter.id)) {
					deps.push(fromFrontmatter.id);
				}
				dependenciesByFile.set(toNode.file, deps);
			}

			console.debug('[Canvas Plugin] Dependencies by file:', Object.fromEntries(dependenciesByFile));
			console.debug('[Canvas Plugin] All plugin files:', Array.from(allPluginFiles));

			// Update MD files
			let updatedCount = 0;
			let clearedCount = 0;

			// Set flag to prevent cascading updates
			this.isUpdatingCanvas = true;

			try {
				// Update files that have dependencies
				for (const [filePath, depIds] of dependenciesByFile) {
					const updated = await this.updateDependsOnInFile(filePath, depIds);
					if (updated) updatedCount++;
				}

				// Clear depends_on for files that no longer have incoming edges
				for (const filePath of allPluginFiles) {
					if (!dependenciesByFile.has(filePath)) {
						const cleared = await this.updateDependsOnInFile(filePath, []);
						if (cleared) clearedCount++;
					}
				}
			} finally {
				// Reset flag after a delay to allow file system to settle
				setTimeout(() => {
					this.isUpdatingCanvas = false;
				}, 500);
			}

			console.debug('[Canvas Plugin] Edge sync complete:', { updatedCount, clearedCount });

			// Also sync reverse relationships (blocks, children, implemented_by, etc.)
			await this.syncReverseRelationships(canvasFile);
		} catch (error) {
			console.error('[Canvas Plugin] Failed to sync edges to MD files:', error);
			this.logger?.error("Failed to sync edges to MD files", error);
		}
	}

	/**
	 * Update the depends_on field in a single MD file
	 * Returns true if the file was actually modified
	 */
	private async updateDependsOnInFile(filePath: string, dependencyIds: string[]): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return false;
		}

		try {
			const content = await this.app.vault.read(file);
			const frontmatter = parseFrontmatter(content);

			if (!frontmatter || !isPluginCreatedNote(frontmatter)) {
				return false;
			}

			// Check if depends_on actually changed
			const currentDeps = frontmatter.depends_on || [];
			const sortedCurrent = [...currentDeps].sort();
			const sortedNew = [...dependencyIds].sort();

			if (JSON.stringify(sortedCurrent) === JSON.stringify(sortedNew)) {
				// No change needed
				return false;
			}

			// Update the file
			const updatedContent = updateFrontmatter(content, {
				depends_on: dependencyIds,
				updated: new Date().toISOString(),
			});

			await this.app.vault.modify(file, updatedContent);
			console.debug('[Canvas Plugin] Updated depends_on in', filePath, ':', dependencyIds);
			return true;
		} catch (error) {
			console.error('[Canvas Plugin] Failed to update depends_on in', filePath, ':', error);
			return false;
		}
	}

	/**
	 * Sync reverse relationships in MD files based on ENTITY_SCHEMAS.md spec
	 * This auto-syncs: blocks (reverse of depends_on), children (reverse of parent),
	 * implemented_by (reverse of implements), superseded_by (reverse of supersedes),
	 * next_version (reverse of previous_version), documented_by (reverse of documents),
	 * decided_by (reverse of affects)
	 */
	private async syncReverseRelationships(canvasFile: TFile): Promise<void> {
		console.debug('[Canvas Plugin] ===== Syncing reverse relationships =====');

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);

			// Build maps for all relationships
			// entityId -> { blocks: [], children: [], implementedBy: [], documentedBy: [], decidedBy: [], supersededBy: string, nextVersion: string }
			const reverseRels = new Map<string, {
				blocks: string[];
				children: string[];
				implementedBy: string[];
				documentedBy: string[];
				decidedBy: string[];
				supersededBy?: string;
				nextVersion?: string;
			}>();

			// Helper to ensure entity exists in map
			const ensureEntity = (entityId: string) => {
				if (!reverseRels.has(entityId)) {
					reverseRels.set(entityId, {
						blocks: [],
						children: [],
						implementedBy: [],
						documentedBy: [],
						decidedBy: [],
					});
				}
				return reverseRels.get(entityId)!;
			};

			// Helper to strip quotes from a value
			const stripQuotesLocal = (value: string): string => {
				const trimmed = value.trim();
				if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
					(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
					return trimmed.slice(1, -1);
				}
				return trimmed;
			};

			// Helper to parse YAML array - use [ \t]* instead of \s* to avoid matching newlines
			const parseYamlArray = (text: string, key: string): string[] => {
				const multilineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'));
				if (multilineMatch) {
					const items = multilineMatch[1].match(/^[ \t]*-[ \t]*(.+)$/gm);
					if (items) {
						return items.map(item => stripQuotesLocal(item.replace(/^[ \t]*-[ \t]*/, '')));
					}
				}
				const inlineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\[([^\\]]+)\\]`, 'm'));
				if (inlineMatch) {
					return inlineMatch[1].split(',').map(s => stripQuotesLocal(s));
				}
				const singleMatch = text.match(new RegExp(`^${key}:[ \\t]*([^\\n\\[]+)$`, 'm'));
				if (singleMatch && singleMatch[1].trim()) {
					return [stripQuotesLocal(singleMatch[1])];
				}
				return [];
			};

			// Scan all file nodes on canvas
			for (const node of canvasData.nodes) {
				if (node.type !== 'file' || !node.file) continue;

				const file = this.app.vault.getAbstractFileByPath(node.file);
				if (!(file instanceof TFile)) continue;

				try {
					const content = await this.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (!frontmatterMatch) continue;

					const fm = frontmatterMatch[1];
					// Use [ \t]* instead of \s* to avoid matching newlines
					const idMatch = fm.match(/^id:[ \t]*(.+)$/m);
					if (!idMatch) continue;

					const entityId = idMatch[1].trim();
					ensureEntity(entityId);

					// depends_on -> blocks (reverse)
					const dependsOn = parseYamlArray(fm, 'depends_on');
					for (const depId of dependsOn) {
						const depRels = ensureEntity(depId);
						if (!depRels.blocks.includes(entityId)) {
							depRels.blocks.push(entityId);
						}
					}

					// parent -> children (reverse)
					// Use [ \t]* instead of \s* to avoid matching newlines
					const parentMatch = fm.match(/^parent:[ \t]*(.+)$/m);
					if (parentMatch) {
						const parentId = parentMatch[1].trim();
						const parentRels = ensureEntity(parentId);
						if (!parentRels.children.includes(entityId)) {
							parentRels.children.push(entityId);
						}
					}

					// implements -> implemented_by (reverse)
					// Milestones/Stories implement Features
					const implementsArr = parseYamlArray(fm, 'implements');
					for (const featureId of implementsArr) {
						const featureRels = ensureEntity(featureId);
						if (!featureRels.implementedBy.includes(entityId)) {
							featureRels.implementedBy.push(entityId);
						}
					}

					// documents -> documented_by (reverse)
					// Documents document Features
					const documentsArr = parseYamlArray(fm, 'documents');
					for (const featureId of documentsArr) {
						const featureRels = ensureEntity(featureId);
						if (!featureRels.documentedBy.includes(entityId)) {
							featureRels.documentedBy.push(entityId);
						}
					}

					// affects -> decided_by (reverse)
					// Decisions affect Features
					const affectsArr = parseYamlArray(fm, 'affects');
					for (const featureId of affectsArr) {
						const featureRels = ensureEntity(featureId);
						if (!featureRels.decidedBy.includes(entityId)) {
							featureRels.decidedBy.push(entityId);
						}
					}

					// supersedes -> superseded_by (reverse)
					// Use [ \t]* instead of \s* to avoid matching newlines
					const supersedesMatch = fm.match(/^supersedes:[ \t]*(.+)$/m);
					if (supersedesMatch) {
						const supersededId = supersedesMatch[1].trim();
						const supersededRels = ensureEntity(supersededId);
						supersededRels.supersededBy = entityId;
					}

					// previous_version -> next_version (reverse)
					// Use [ \t]* instead of \s* to avoid matching newlines
					const prevVersionMatch = fm.match(/^previous_version:[ \t]*(.+)$/m);
					if (prevVersionMatch) {
						const prevId = prevVersionMatch[1].trim();
						const prevRels = ensureEntity(prevId);
						prevRels.nextVersion = entityId;
					}
				} catch (e) {
					console.warn('[Canvas Plugin] Failed to read file for reverse sync:', node.file, e);
				}
			}

			// Now update each entity's file with the computed reverse relationships
			let updatedCount = 0;
			for (const node of canvasData.nodes) {
				if (node.type !== 'file' || !node.file) continue;

				const file = this.app.vault.getAbstractFileByPath(node.file);
				if (!(file instanceof TFile)) continue;

				try {
					const content = await this.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (!frontmatterMatch) continue;

					const fm = frontmatterMatch[1];
					// Use [ \t]* instead of \s* to avoid matching newlines
					const idMatch = fm.match(/^id:[ \t]*(.+)$/m);
					if (!idMatch) continue;

					const entityId = idMatch[1].trim();
					const rels = reverseRels.get(entityId);
					if (!rels) continue;

					// Check if any reverse fields need updating
					const currentBlocks = parseYamlArray(fm, 'blocks');
					const currentChildren = parseYamlArray(fm, 'children');
					const currentImplementedBy = parseYamlArray(fm, 'implemented_by');
					const currentDocumentedBy = parseYamlArray(fm, 'documented_by');
					const currentDecidedBy = parseYamlArray(fm, 'decided_by');
					// Use [ \t]* instead of \s* to avoid matching newlines
					const supersededByMatch = fm.match(/^superseded_by:[ \t]*(.+)$/m);
					const currentSupersededBy = supersededByMatch?.[1]?.trim();
					const nextVersionMatch = fm.match(/^next_version:[ \t]*(.+)$/m);
					const currentNextVersion = nextVersionMatch?.[1]?.trim();

					// Compare and update if different
					const blocksChanged = JSON.stringify([...currentBlocks].sort()) !== JSON.stringify([...rels.blocks].sort());
					const childrenChanged = JSON.stringify([...currentChildren].sort()) !== JSON.stringify([...rels.children].sort());
					const implementedByChanged = JSON.stringify([...currentImplementedBy].sort()) !== JSON.stringify([...rels.implementedBy].sort());
					const documentedByChanged = JSON.stringify([...currentDocumentedBy].sort()) !== JSON.stringify([...rels.documentedBy].sort());
					const decidedByChanged = JSON.stringify([...currentDecidedBy].sort()) !== JSON.stringify([...rels.decidedBy].sort());
					const supersededByChanged = currentSupersededBy !== rels.supersededBy;
					const nextVersionChanged = currentNextVersion !== rels.nextVersion;

					if (blocksChanged || childrenChanged || implementedByChanged || documentedByChanged || decidedByChanged || supersededByChanged || nextVersionChanged) {
						// Build update object
						const updates: Record<string, unknown> = {
							updated: new Date().toISOString(),
						};

						if (blocksChanged && rels.blocks.length > 0) {
							updates.blocks = rels.blocks;
						}
						if (childrenChanged && rels.children.length > 0) {
							updates.children = rels.children;
						}
						if (implementedByChanged && rels.implementedBy.length > 0) {
							updates.implemented_by = rels.implementedBy;
						}
						if (documentedByChanged && rels.documentedBy.length > 0) {
							updates.documented_by = rels.documentedBy;
						}
						if (decidedByChanged && rels.decidedBy.length > 0) {
							updates.decided_by = rels.decidedBy;
						}
						if (supersededByChanged && rels.supersededBy) {
							updates.superseded_by = rels.supersededBy;
						}
						if (nextVersionChanged && rels.nextVersion) {
							updates.next_version = rels.nextVersion;
						}

						// Update the file
						const updatedContent = updateFrontmatter(content, updates);
						await this.app.vault.modify(file, updatedContent);
						updatedCount++;
						console.debug('[Canvas Plugin] Updated reverse relationships in', node.file);
					}
				} catch (e) {
					console.warn('[Canvas Plugin] Failed to update reverse relationships in:', node.file, e);
				}
			}

			console.debug('[Canvas Plugin] Reverse relationship sync complete. Updated', updatedCount, 'files');
		} catch (error) {
			console.error('[Canvas Plugin] Failed to sync reverse relationships:', error);
		}
	}

	/**
	 * Handle MD file modifications to update canvas node colors (e.g., inProgress flag)
	 * and optionally sync to Notion with debouncing
	 */
	private async handleMdFileModification(file: TFile): Promise<void> {
		// Skip if we're currently updating the canvas ourselves
		if (this.isUpdatingCanvas) {
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			const frontmatter = parseFrontmatter(content);

			// Only process plugin-created notes
			if (!frontmatter || !isPluginCreatedNote(frontmatter)) {
				return;
			}

			// Cache the entity ID for deletion sync
			if (frontmatter.id) {
				this.fileEntityIdCache.set(file.path, frontmatter.id);
			}

			// Get the canvas source
			const canvasSource = frontmatter.canvas_source;
			if (!canvasSource) {
				return;
			}

			// Find the canvas file
			const canvasFile = this.app.vault.getAbstractFileByPath(canvasSource);
			if (!(canvasFile instanceof TFile)) {
				return;
			}

			// Load canvas data
			const canvasData = await loadCanvasData(this.app, canvasFile);

			// Find the node that references this file
			const node = canvasData.nodes.find((n: CanvasNode) => n.file === file.path);
			if (!node) {
				return;
			}

			// Resolve the new color based on inProgress and effort
			const newColor = this.resolveNodeColor(frontmatter.effort, frontmatter.inProgress);

			// Check if color needs to be updated
			if (node.color !== newColor) {
				console.debug('[Canvas Plugin] Updating node color for', file.path, 'from', node.color, 'to', newColor);

				// Update the node color
				node.color = newColor;

				// Save the canvas
				this.isUpdatingCanvas = true;
				try {
					await saveCanvasData(this.app, canvasFile, canvasData);
					// Reload canvas to reflect changes
					await reloadCanvasViewsWithViewport(this.app, canvasFile);
				} finally {
					setTimeout(() => {
						this.isUpdatingCanvas = false;
					}, 500);
				}
			}

			// Debounced sync to Notion (if enabled)
			if (this.settings.notionEnabled &&
				this.settings.autoSyncOnMdChange &&
				!this.settings.syncOnDemandOnly &&
				this.notionClient) {

				// Clear existing debounce timer for this file
				const existingTimer = this.mdSyncDebounceTimers.get(file.path);
				if (existingTimer) {
					clearTimeout(existingTimer);
				}

				// Set new debounce timer (2 seconds)
				const timer = setTimeout(() => {
					this.mdSyncDebounceTimers.delete(file.path);
					this.notionClient!.syncNote(frontmatter)
						.then(() => {
							console.debug('[Canvas Plugin] Auto-sync complete:', file.path);
						})
						.catch((error: unknown) => {
							console.error('[Canvas Plugin] Auto-sync failed:', error);
							// Don't show notice for auto-sync failures to avoid spam
						});
				}, 2000);

				this.mdSyncDebounceTimers.set(file.path, timer);
			}
		} catch (error) {
			this.logger?.error("Failed to handle MD file modification", error);
		}
	}

	/**
	 * Handle MD file deletion to archive corresponding Notion page
	 */
	private async handleMdFileDeletion(file: TFile): Promise<void> {
		// Check if Notion sync is enabled
		if (!this.settings.notionEnabled || !this.notionClient) {
			return;
		}

		try {
			// Get the entity ID from cache
			const entityId = this.fileEntityIdCache.get(file.path);
			if (!entityId) {
				console.debug('[Canvas Plugin] No cached entity ID for deleted file:', file.path);
				return;
			}

			// Remove from cache
			this.fileEntityIdCache.delete(file.path);

			// Find the Notion page by entity ID
			const page = await this.notionClient.findPageByEntityId(entityId);
			if (!page) {
				console.debug('[Canvas Plugin] No Notion page found for entity:', entityId);
				return;
			}

			// Archive the page
			console.debug('[Canvas Plugin] Archiving Notion page for deleted file:', file.path, 'entity:', entityId);
			await this.notionClient.archivePage(page.id);
			console.debug('[Canvas Plugin] Notion page archived successfully');
			new Notice(`Notion page archived for deleted note: ${entityId}`);
		} catch (error) {
			console.error('[Canvas Plugin] Failed to archive Notion page:', error);
			this.logger?.error("Failed to archive Notion page for deleted file", error);
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
			console.debug('[Canvas Plugin] checkAndDeletePluginFile called');
			console.debug('[Canvas Plugin] Canvas file:', canvasFile.path);
			console.debug('[Canvas Plugin] Current file nodes in canvas:', Array.from(currentFileNodes));

			// Get all markdown files in the vault
			const allFiles = this.app.vault.getMarkdownFiles();
			console.debug('[Canvas Plugin] Total markdown files in vault:', allFiles.length);

			for (const file of allFiles) {
				const content = await this.app.vault.read(file);
				const frontmatter = parseFrontmatter(content);

				// Check if this file was created by our plugin
				const isPluginFile = frontmatter && isPluginCreatedNote(frontmatter);
				if (isPluginFile) {
					console.debug('[Canvas Plugin] Found plugin-created file:', file.path);
					console.debug('[Canvas Plugin] Frontmatter:', {
						type: frontmatter.type,
						id: frontmatter.id,
						canvas_source: frontmatter.canvas_source,
						created_by_plugin: frontmatter.created_by_plugin
					});

					// Check if file is referenced in canvas_source
					const canvasSources = Array.isArray(frontmatter.canvas_source)
						? frontmatter.canvas_source
						: [frontmatter.canvas_source];

					console.debug('[Canvas Plugin] Canvas sources for file:', canvasSources);
					console.debug('[Canvas Plugin] Current canvas path:', canvasFile.path);

					// If this note references the current canvas
					if (canvasSources.includes(canvasFile.path)) {
						// Check if the note is still in the canvas
						const isInCanvas = currentFileNodes.has(file.path);
						console.debug('[Canvas Plugin] Is file still in canvas?', isInCanvas);

						if (!isInCanvas) {
							// File was removed from canvas, delete it
							console.debug('[Canvas Plugin] Deleting file:', file.path);
							await this.app.fileManager.trashFile(file);
							new Notice(`🗑️ Deleted: ${file.basename}`);
							this.logger?.info("Plugin-created file auto-deleted", {
								file: file.path,
								canvas: canvasFile.path,
							});
						}
					} else {
						console.debug('[Canvas Plugin] File does not reference this canvas');
					}
				}
			}
		} catch (error) {
			console.error('[Canvas Plugin] Failed to check and delete plugin file:', error);
			this.logger?.error("Failed to check and delete plugin file", error);
		}
	}

	/**
	 * Start bi-directional sync polling
	 */
	private startNotionSyncPolling(): void {
		if (!this.settings.notionEnabled || this.settings.syncOnDemandOnly) {
			return;
		}

		const intervalMs = this.settings.notionSyncIntervalMinutes * 60 * 1000;
		console.debug('[Canvas Plugin] Starting Notion sync polling every', this.settings.notionSyncIntervalMinutes, 'minutes');

		this.notionSyncIntervalId = setInterval(() => {
			void this.pollNotionForChanges();
		}, intervalMs);
	}

	/**
	 * Stop bi-directional sync polling
	 */
	private stopNotionSyncPolling(): void {
		if (this.notionSyncIntervalId) {
			clearInterval(this.notionSyncIntervalId);
			this.notionSyncIntervalId = null;
			console.debug('[Canvas Plugin] Stopped Notion sync polling');
		}
	}

	/**
	 * Restart bi-directional sync polling (after settings change)
	 */
	private restartNotionSyncPolling(): void {
		this.stopNotionSyncPolling();
		this.startNotionSyncPolling();
	}

	/**
	 * Poll Notion for changes and update local files
	 */
	private async pollNotionForChanges(): Promise<void> {
		if (!this.notionClient || !this.settings.notionEnabled) {
			return;
		}

		if (!this.notionClient.isDatabaseInitialized()) {
			return;
		}

		try {
			console.debug('[Canvas Plugin] Polling Notion for changes...');
			const pages = await this.notionClient.queryAllPages();

			let updatedCount = 0;

			for (const page of pages) {
				try {
					// Get entity ID from page
					const notionPage = page as NotionPage;
					const idProperty = notionPage.properties?.ID;
					const entityId = idProperty?.rich_text?.[0]?.plain_text;
					if (!entityId) continue;

					// Find local file by entity ID
					const localFilePath = this.findFileByEntityId(entityId);
					if (!localFilePath) continue;

					const localFile = this.app.vault.getAbstractFileByPath(localFilePath);
					if (!(localFile instanceof TFile)) continue;

					// Compare timestamps
					if (!notionPage.last_edited_time) continue;
					const notionUpdated = new Date(notionPage.last_edited_time).getTime();
					const content = await this.app.vault.read(localFile);
					const frontmatter = parseFrontmatter(content);
					if (!frontmatter) continue;

					const localUpdated = new Date(frontmatter.updated).getTime();

					// If Notion is newer, update local file
					if (notionUpdated > localUpdated + 1000) { // 1 second buffer
						console.debug('[Canvas Plugin] Notion page is newer, updating local file:', localFilePath);
						await this.updateLocalFileFromNotion(localFile, page);
						updatedCount++;
					}
				} catch (error) {
					console.error('[Canvas Plugin] Error processing page:', error);
				}
			}

			if (updatedCount > 0) {
				console.debug('[Canvas Plugin] Updated', updatedCount, 'local files from Notion');
			} else {
				console.debug('[Canvas Plugin] No changes from Notion');
			}
		} catch (error) {
			console.error('[Canvas Plugin] Failed to poll Notion:', error);
		}
	}

	/**
	 * Find local file path by entity ID
	 */
	private findFileByEntityId(entityId: string): string | null {
		for (const [filePath, id] of this.fileEntityIdCache) {
			if (id === entityId) {
				return filePath;
			}
		}
		return null;
	}

	/**
	 * Update local file from Notion page data
	 */
	private async updateLocalFileFromNotion(file: TFile, page: NotionPage): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			const frontmatter = parseFrontmatter(content);
			if (!frontmatter) return;

			// Extract properties from Notion page
			const props = page.properties;
			if (!props) return;

			// Update frontmatter from Notion properties
			if (props.Title?.title?.[0]?.plain_text) {
				frontmatter.title = props.Title.title[0].plain_text;
			}
			if (props.Status?.select?.name) {
				frontmatter.status = this.mapNotionStatusToLocal(props.Status.select.name);
			}
			if (props.Priority?.select?.name) {
				frontmatter.priority = props.Priority.select.name as ItemPriority;
			}
			if (props.Effort?.select?.name) {
				frontmatter.effort = props.Effort.select.name;
			}
			if (props["In Progress"]?.checkbox !== undefined) {
				frontmatter.inProgress = props["In Progress"].checkbox;
			}
			if (props["Time Estimate"]?.number !== undefined) {
				frontmatter.time_estimate = props["Time Estimate"].number;
			}

			// Update the updated timestamp
			if (page.last_edited_time) {
				frontmatter.updated = new Date(page.last_edited_time).toISOString();
			}

			// Get body content from Notion blocks
			const blocks = await this.notionClient!.getPageContent(page.id);
			const bodyContent = this.notionBlocksToMarkdown(blocks);

			// Rebuild the file content
			const newContent = this.buildMarkdownContent(frontmatter, bodyContent);

			// Write the updated content
			this.isUpdatingCanvas = true; // Prevent triggering auto-sync back to Notion
			try {
				await this.app.vault.modify(file, newContent);
				console.debug('[Canvas Plugin] Updated local file from Notion:', file.path);

				// Update canvas node color if inProgress changed
				await this.handleMdFileModification(file);
			} finally {
				setTimeout(() => {
					this.isUpdatingCanvas = false;
				}, 1000);
			}
		} catch (error) {
			console.error('[Canvas Plugin] Failed to update local file from Notion:', error);
			throw error;
		}
	}

	/**
	 * Map Notion status to local status
	 */
	private mapNotionStatusToLocal(notionStatus: string): ItemStatus {
		const map: Record<string, ItemStatus> = {
			"todo": "Not Started",
			"in_progress": "In Progress",
			"done": "Completed",
			"blocked": "Blocked",
		};
		return map[notionStatus] || "Not Started";
	}

	/**
	 * Convert Notion blocks to markdown
	 */
	private notionBlocksToMarkdown(blocks: NotionBlock[]): string {
		const lines: string[] = [];

		for (const block of blocks) {
			switch (block.type) {
				case "heading_1":
					lines.push(`# ${this.richTextToPlain(block.heading_1?.rich_text || [])}`);
					break;
				case "heading_2":
					lines.push(`## ${this.richTextToPlain(block.heading_2?.rich_text || [])}`);
					break;
				case "heading_3":
					lines.push(`### ${this.richTextToPlain(block.heading_3?.rich_text || [])}`);
					break;
				case "paragraph":
					lines.push(this.richTextToPlain(block.paragraph?.rich_text || []));
					break;
				case "bulleted_list_item":
					lines.push(`- ${this.richTextToPlain(block.bulleted_list_item?.rich_text || [])}`);
					break;
				case "numbered_list_item":
					lines.push(`1. ${this.richTextToPlain(block.numbered_list_item?.rich_text || [])}`);
					break;
				case "to_do": {
					const checked = block.to_do?.checked ? "x" : " ";
					lines.push(`- [${checked}] ${this.richTextToPlain(block.to_do?.rich_text || [])}`);
					break;
				}
				case "divider":
					lines.push("---");
					break;
				default:
					// Skip unsupported block types
					break;
			}
		}

		return lines.join("\n");
	}

	/**
	 * Convert Notion rich text to plain text
	 */
	private richTextToPlain(richText: NotionRichText[]): string {
		if (!richText || !Array.isArray(richText)) return "";
		return richText.map(rt => rt.plain_text || "").join("");
	}

	/**
	 * Build markdown content from frontmatter and body
	 */
	private buildMarkdownContent(frontmatter: ItemFrontmatter, body: string): string {
		const yaml = [
			"---",
			`type: ${frontmatter.type}`,
			`title: "${frontmatter.title.replace(/"/g, '\\"')}"`,
			`effort: ${frontmatter.effort}`,
			`id: ${frontmatter.id}`,
			`status: "${frontmatter.status}"`,
			`priority: ${frontmatter.priority}`,
			`inProgress: ${frontmatter.inProgress ?? false}`,
			frontmatter.time_estimate !== undefined ? `time_estimate: ${frontmatter.time_estimate}` : null,
			frontmatter.depends_on?.length ? `depends_on: [${frontmatter.depends_on.map(d => `"${d}"`).join(", ")}]` : null,
			`created_by_plugin: ${frontmatter.created_by_plugin ?? true}`,
			`created: ${frontmatter.created}`,
			`updated: ${frontmatter.updated}`,
			`canvas_source: "${frontmatter.canvas_source}"`,
			`vault_path: "${frontmatter.vault_path}"`,
			frontmatter.notion_page_id ? `notion_page_id: "${frontmatter.notion_page_id}"` : null,
			"---",
		].filter(line => line !== null).join("\n");

		return `${yaml}\n\n${body}`;
	}

	/**
	 * Move archived entity files to archive subfolders based on their type.
	 * Archive structure: archive/milestones/, archive/stories/, archive/tasks/, etc.
	 * @param baseFolder - The base folder where entities and archive folder are located
	 * @returns Number of files moved
	 */
	private async moveArchivedFilesToArchive(baseFolder: string): Promise<number> {
		console.group('[Canvas Plugin] moveArchivedFilesToArchive');
		console.log('Base folder:', baseFolder);
		new Notice(`🔍 Scanning for archived files in: ${baseFolder}`);

		const entityTypes = ['milestone', 'story', 'task', 'decision', 'document'];
		const typeToFolder: Record<string, string> = {
			milestone: 'milestones',
			story: 'stories',
			task: 'tasks',
			decision: 'decisions',
			document: 'documents',
		};

		let movedCount = 0;
		let archivedFound = 0;

		try {
			// Get all markdown files in the vault
			const allFiles = this.app.vault.getMarkdownFiles();
			console.log('Total markdown files in vault:', allFiles.length);

			// Filter to files in the base folder (but not already in archive)
			// If baseFolder is empty, include all files (but still exclude archive)
			const filesInBaseFolder = allFiles.filter(f => {
				const inBaseFolder = baseFolder === '' || f.path.startsWith(baseFolder);
				// Check for archive folder - handles both "archive/" at root and "/archive/" in subfolders
				const notInArchive = !f.path.includes('/archive/') && !f.path.startsWith('archive/');
				return inBaseFolder && notInArchive;
			});
			console.log('Files in base folder (excluding archive):', filesInBaseFolder.length);
			new Notice(`📂 Found ${filesInBaseFolder.length} files in base folder (excluding archive)`);

			for (const file of filesInBaseFolder) {
				try {
					const content = await this.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (!frontmatterMatch) {
						console.log(`  [SKIP] No frontmatter: ${file.path}`);
						continue;
					}

					const frontmatterText = frontmatterMatch[1];

					// Check if archived
					const statusMatch = frontmatterText.match(/^status:\s*(.+)$/m);
					const archivedMatch = frontmatterText.match(/^archived:\s*(.+)$/m);
					const statusValue = statusMatch?.[1]?.trim().toLowerCase();
					const archivedValue = archivedMatch?.[1]?.trim().toLowerCase();
					const isArchived = statusValue === 'archived' || archivedValue === 'true';

					if (!isArchived) {
						continue;
					}

					archivedFound++;
					console.log(`  [ARCHIVED] Found archived file: ${file.path} (status=${statusValue}, archived=${archivedValue})`);

					// Get entity type
					const typeMatch = frontmatterText.match(/^type:\s*(.+)$/m);
					if (!typeMatch) {
						console.log(`    [SKIP] No type field in: ${file.path}`);
						continue;
					}

					const entityType = typeMatch[1].trim().toLowerCase();
					if (!entityTypes.includes(entityType)) {
						console.log(`    [SKIP] Unknown entity type '${entityType}' in: ${file.path}`);
						continue;
					}

					// Determine archive subfolder
					const archiveSubfolder = typeToFolder[entityType] || entityType + 's';
					const archivePath = baseFolder ? `${baseFolder}/archive/${archiveSubfolder}` : `archive/${archiveSubfolder}`;

					// Ensure archive folder exists (tolerant - ignore if already exists)
					try {
						const archiveFolder = this.app.vault.getAbstractFileByPath(archivePath);
						if (!archiveFolder) {
							console.log(`    Creating archive folder: ${archivePath}`);
							await this.app.vault.createFolder(archivePath);
						}
					} catch (folderError) {
						// Folder might already exist or parent needs creation - ignore and continue
						console.log(`    Archive folder check/create: ${archivePath} (may already exist)`);
					}

					// Move file to archive
					const newPath = `${archivePath}/${file.name}`;
					console.log(`    Moving: ${file.path} -> ${newPath}`);
					await this.app.fileManager.renameFile(file, newPath);
					movedCount++;
					console.log(`    ✅ Moved successfully`);

				} catch (e) {
					console.error('Error processing file:', file.path, e);
					new Notice(`❌ Error moving file: ${file.path}`);
				}
			}

			console.log(`Summary: Found ${archivedFound} archived files, moved ${movedCount}`);
			console.groupEnd();
			new Notice(`📊 Archive scan complete: ${archivedFound} archived found, ${movedCount} moved`);
			return movedCount;

		} catch (error) {
			console.error('Error in moveArchivedFilesToArchive:', error);
			console.groupEnd();
			new Notice(`❌ Error in archive scan: ${(error as Error).message}`);
			return movedCount;
		}
	}

	/**
	 * Remove archived nodes from the canvas.
	 * Checks each file node's frontmatter for archived status and removes if archived.
	 * @param canvasFile - The canvas file to clean
	 * @returns Number of nodes removed
	 */
	private async removeArchivedNodesFromCanvas(canvasFile: TFile): Promise<number> {
		console.group('[Canvas Plugin] removeArchivedNodesFromCanvas');
		new Notice(`🔍 Scanning canvas for archived nodes...`);

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			const fileNodes = canvasData.nodes.filter(n => n.type === 'file');
			console.log('File nodes on canvas:', fileNodes.length);
			new Notice(`📋 Checking ${fileNodes.length} file nodes on canvas`);

			const nodesToRemove = new Set<string>();
			let missingFiles = 0;
			let archivedNodes = 0;

			for (const node of fileNodes) {
				if (!node.file) continue;

				const file = this.app.vault.getAbstractFileByPath(node.file);
				if (!(file instanceof TFile)) {
					// File doesn't exist anymore, mark for removal
					console.log(`  [MISSING] File not found: ${node.file}`);
					nodesToRemove.add(node.id);
					missingFiles++;
					continue;
				}

				try {
					const content = await this.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (!frontmatterMatch) continue;

					const frontmatterText = frontmatterMatch[1];

					// Check if archived
					const statusMatch = frontmatterText.match(/^status:\s*(.+)$/m);
					const archivedMatch = frontmatterText.match(/^archived:\s*(.+)$/m);
					const statusValue = statusMatch?.[1]?.trim().toLowerCase();
					const archivedValue = archivedMatch?.[1]?.trim().toLowerCase();
					const isArchived = statusValue === 'archived' || archivedValue === 'true';

					if (isArchived) {
						console.log(`  [ARCHIVED] Node is archived: ${node.file} (status=${statusValue}, archived=${archivedValue})`);
						nodesToRemove.add(node.id);
						archivedNodes++;
					}
				} catch (e) {
					console.warn('Error reading file for node:', node.id, e);
				}
			}

			console.log(`Summary: ${missingFiles} missing files, ${archivedNodes} archived nodes`);

			if (nodesToRemove.size === 0) {
				console.log('No archived nodes to remove');
				console.groupEnd();
				new Notice(`✅ No archived nodes found on canvas`);
				return 0;
			}

			console.log('Removing', nodesToRemove.size, 'nodes total');
			new Notice(`🗑️ Removing ${nodesToRemove.size} nodes (${archivedNodes} archived, ${missingFiles} missing files)`);

			// Remove nodes
			canvasData.nodes = canvasData.nodes.filter(n => !nodesToRemove.has(n.id));

			// Remove edges connected to removed nodes
			const edgesBefore = canvasData.edges.length;
			canvasData.edges = canvasData.edges.filter(e =>
				!nodesToRemove.has(e.fromNode) && !nodesToRemove.has(e.toNode)
			);
			const edgesRemoved = edgesBefore - canvasData.edges.length;
			if (edgesRemoved > 0) {
				console.log('Also removed', edgesRemoved, 'orphaned edges');
			}

			// Save canvas (don't close/reopen - caller will handle that)
			await this.app.vault.modify(canvasFile, JSON.stringify(canvasData, null, '\t'));
			console.log('Canvas saved');

			console.groupEnd();
			return nodesToRemove.size;

		} catch (error) {
			console.error('Error in removeArchivedNodesFromCanvas:', error);
			console.groupEnd();
			return 0;
		}
	}

	/**
	 * Show unarchive confirmation dialog and perform unarchive
	 */
	private async unarchiveStoriesAndTasks(): Promise<void> {
		// Get project root folder from settings or current canvas
		const projectRoot = this.getProjectRootFolder();
		const archiveFolder = projectRoot ? `${projectRoot}/archive` : 'archive';

		// First, count archived files by type by scanning the archive folder
		const allFiles = this.app.vault.getMarkdownFiles();
		const typeToFolder: Record<string, string> = {
			milestone: 'milestones',
			story: 'stories',
			task: 'tasks',
			decision: 'decisions',
			document: 'documents',
		};
		const allEntityTypes = Object.keys(typeToFolder);

		// Filter to files in the project's archive folder
		const archivedFiles = allFiles.filter(f =>
			f.path.startsWith(`${archiveFolder}/`)
		);

		// Count files by entity type based on frontmatter
		const counts: Record<string, number> = {};
		for (const type of allEntityTypes) {
			counts[type] = 0;
		}

		for (const file of archivedFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
				if (frontmatterMatch) {
					const typeMatch = frontmatterMatch[1].match(/^type:\s*(.+)$/m);
					if (typeMatch) {
						const entityType = typeMatch[1].trim().toLowerCase();
						if (allEntityTypes.includes(entityType)) {
							counts[entityType]++;
						}
					}
				}
			} catch (e) {
				// Skip files that can't be read
			}
		}

		// Show confirmation modal with checkboxes
		const result = await this.showUnarchiveConfirmationModal(counts, typeToFolder, archiveFolder);
		if (!result || result.selectedTypes.length === 0) {
			return;
		}

		// Perform the unarchive
		await this.performUnarchive(result.selectedTypes, typeToFolder, archiveFolder);
	}

	/**
	 * Get the project root folder from the active canvas or settings
	 */
	private getProjectRootFolder(): string {
		// Try to get from active canvas
		const canvasFile = this.getActiveCanvasFile();
		if (canvasFile) {
			// Canvas is at project root, e.g., "Projects/AgentPlatform/project.canvas"
			const parts = canvasFile.path.split('/');
			if (parts.length > 1) {
				parts.pop(); // Remove filename
				return parts.join('/');
			}
		}
		return '';
	}

	/**
	 * Show confirmation modal for unarchiving with entity type selection
	 */
	private async showUnarchiveConfirmationModal(
		counts: Record<string, number>,
		typeToFolder: Record<string, string>,
		archiveFolder: string
	): Promise<{ selectedTypes: string[] } | null> {
		return new Promise((resolve) => {
			const modal = new (class extends Modal {
				selectedTypes: Set<string> = new Set(['story', 'task']); // Default selection

				constructor(app: App) {
					super(app);
				}

				onOpen() {
					const { contentEl } = this;
					contentEl.empty();
					contentEl.createEl("h2", { text: "Unarchive Entities" });
					contentEl.createEl("p", {
						text: `Scanning: ${archiveFolder}/`,
						cls: "setting-item-description"
					});
					contentEl.createEl("p", {
						text: "Select which entity types to unarchive. Files will be moved back to their original locations.",
						cls: "setting-item-description"
					});

					// Create checkboxes for each entity type
					const checkboxContainer = contentEl.createDiv({ cls: "unarchive-checkbox-container" });
					checkboxContainer.style.marginBottom = "16px";

					for (const [type, folder] of Object.entries(typeToFolder)) {
						const count = counts[type] || 0;
						const itemDiv = checkboxContainer.createDiv({ cls: "unarchive-checkbox-item" });
						itemDiv.style.display = "flex";
						itemDiv.style.alignItems = "center";
						itemDiv.style.marginBottom = "8px";

						const checkbox = itemDiv.createEl("input", { type: "checkbox" });
						checkbox.id = `unarchive-${type}`;
						checkbox.checked = this.selectedTypes.has(type);
						checkbox.disabled = count === 0;
						checkbox.style.marginRight = "8px";
						checkbox.addEventListener("change", () => {
							if (checkbox.checked) {
								this.selectedTypes.add(type);
							} else {
								this.selectedTypes.delete(type);
							}
						});

						const label = itemDiv.createEl("label");
						label.htmlFor = `unarchive-${type}`;
						label.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}s`;
						label.style.marginRight = "8px";

						const countSpan = itemDiv.createEl("span", {
							text: `(${count} archived)`,
							cls: count === 0 ? "faint" : ""
						});
						countSpan.style.color = count === 0 ? "var(--text-muted)" : "var(--text-normal)";
					}

					// Total count
					const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
					contentEl.createEl("p", {
						text: `Total archived entities: ${totalCount}`,
						cls: "setting-item-description"
					});

					// Buttons
					const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
					buttonContainer.style.display = "flex";
					buttonContainer.style.justifyContent = "flex-end";
					buttonContainer.style.gap = "8px";
					buttonContainer.style.marginTop = "16px";

					const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
					cancelBtn.addEventListener("click", () => {
						this.close();
					});

					const confirmBtn = buttonContainer.createEl("button", {
						text: "Unarchive Selected",
						cls: "mod-cta"
					});
					confirmBtn.addEventListener("click", () => {
						this.close();
					});
				}

				onClose() {
					if (this.selectedTypes.size > 0) {
						resolve({ selectedTypes: Array.from(this.selectedTypes) });
					} else {
						resolve(null);
					}
				}
			})(this.app);
			modal.open();
		});
	}

	/**
	 * Perform the actual unarchive operation
	 */
	private async performUnarchive(
		typesToUnarchive: string[],
		typeToFolder: Record<string, string>,
		archiveFolder: string
	): Promise<number> {
		console.group('[Canvas Plugin] performUnarchive');
		console.log('Archive folder:', archiveFolder);
		new Notice(`🔍 Scanning ${archiveFolder}/...`);

		let unarchivedCount = 0;

		try {
			const allFiles = this.app.vault.getMarkdownFiles();
			console.log('Total markdown files in vault:', allFiles.length);

			// Filter to files in the project's archive folder
			const archivedFiles = allFiles.filter(f => f.path.startsWith(`${archiveFolder}/`));
			console.log('Files in archive folder:', archivedFiles.length);

			// Get project root (parent of archive folder)
			const projectRoot = archiveFolder.endsWith('/archive')
				? archiveFolder.slice(0, -8)
				: archiveFolder.split('/').slice(0, -1).join('/');

			let processedCount = 0;
			for (const file of archivedFiles) {
				try {
					const content = await this.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (!frontmatterMatch) {
						console.log(`  [SKIP] No frontmatter: ${file.path}`);
						continue;
					}

					const frontmatterText = frontmatterMatch[1];

					// Get entity type
					const typeMatch = frontmatterText.match(/^type:\s*(.+)$/m);
					if (!typeMatch) {
						console.log(`  [SKIP] No type field in: ${file.path}`);
						continue;
					}

					const entityType = typeMatch[1].trim().toLowerCase();
					if (!typesToUnarchive.includes(entityType)) {
						console.log(`  [SKIP] Type not selected: ${file.path} (type=${entityType})`);
						continue;
					}

					// Determine destination folder
					const destFolder = typeToFolder[entityType] || entityType + 's';
					const destPath = projectRoot ? `${projectRoot}/${destFolder}/${file.name}` : `${destFolder}/${file.name}`;

					// Ensure destination folder exists
					try {
						const destFolderPath = projectRoot ? `${projectRoot}/${destFolder}` : destFolder;
						const folder = this.app.vault.getAbstractFileByPath(destFolderPath);
						if (!folder) {
							console.log(`    Creating folder: ${destFolderPath}`);
							await this.app.vault.createFolder(destFolderPath);
						}
					} catch (folderError) {
						// Folder might already exist - ignore
						console.log(`    Folder check/create: ${destFolder} (may already exist)`);
					}

					// Check if destination file already exists
					const existingFile = this.app.vault.getAbstractFileByPath(destPath);
					if (existingFile instanceof TFile) {
						// Destination exists - delete the archived duplicate quietly
						console.log(`    [DUPLICATE] Destination exists, deleting archived file: ${file.path}`);
						await this.app.vault.delete(file);
						unarchivedCount++; // Count as processed
						processedCount++;
						continue;
					}

					// Move file to destination
					console.log(`    Moving: ${file.path} -> ${destPath}`);
					await this.app.fileManager.renameFile(file, destPath);

					// Update frontmatter to set archived: false and status to "Not Started"
					const movedFile = this.app.vault.getAbstractFileByPath(destPath);
					if (movedFile instanceof TFile) {
						const updatedContent = await this.app.vault.read(movedFile);
						const newContent = updateFrontmatter(updatedContent, {
							archived: false,
							status: 'Not Started',
						});
						await this.app.vault.modify(movedFile, newContent);
						console.log(`    ✅ Unarchived and updated frontmatter`);
					}

					unarchivedCount++;
					processedCount++;

				} catch (e) {
					console.error('Error processing file:', file.path, e);
					new Notice(`❌ Error unarchiving file: ${file.path}`);
				}
			}

			console.log(`Summary: Unarchived ${unarchivedCount} files`);
			console.groupEnd();
			new Notice(`✅ Unarchived ${unarchivedCount} entities`);
			return unarchivedCount;

		} catch (error) {
			console.error('Error in performUnarchive:', error);
			console.groupEnd();
			new Notice(`❌ Error in unarchive: ${(error as Error).message}`);
			return unarchivedCount;
		}
	}

	/**
	 * Populate canvas from vault entities
	 * Scans the vault for all entity files (milestones, stories, tasks, decisions, documents)
	 * and creates canvas nodes for each entity that isn't already on the canvas
	 */
	private async populateCanvasFromVault(): Promise<void> {
		console.group('[Canvas Plugin] populateCanvasFromVault');
		console.log('=== STAGE 1: INITIALIZATION ===');

		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			console.warn('No active canvas file found');
			console.groupEnd();
			new Notice("Please open a canvas file first");
			return;
		}
		console.log('Canvas file:', canvasFile.path);

		// Get canvas view state
		const leaves = this.app.workspace.getLeavesOfType("canvas");
		const canvasLeaf = leaves.find(leaf => {
			const view = leaf.view as { file?: TFile };
			return view.file?.path === canvasFile.path;
		});
		const canvasView = canvasLeaf?.view as {
			canvas?: {
				nodes?: Map<string, unknown>;
				data?: { nodes: unknown[] };
				requestSave?: () => void;
				createFileNode?: (opts: unknown) => unknown;
			}
		} | undefined;

		console.log('Canvas view found:', !!canvasView);
		console.log('Canvas internal object:', !!canvasView?.canvas);
		console.log('Canvas nodes Map:', canvasView?.canvas?.nodes ? `Map with ${canvasView.canvas.nodes.size} entries` : 'undefined');
		console.log('Canvas data.nodes:', canvasView?.canvas?.data?.nodes ? `Array with ${canvasView.canvas.data.nodes.length} entries` : 'undefined');
		console.log('Canvas has createFileNode:', !!canvasView?.canvas?.createFileNode);
		console.log('Canvas has requestSave:', !!canvasView?.canvas?.requestSave);

		new Notice("Scanning vault for entities...");

		try {
			console.log('\n=== STAGE 2: LOAD CANVAS FILE DATA ===');
			// Load current canvas data from FILE (not in-memory)
			const canvasData = await loadCanvasData(this.app, canvasFile);
			console.log('Canvas file data loaded:');
			console.log('  - Nodes in file:', canvasData.nodes.length);
			console.log('  - Edges in file:', canvasData.edges.length);
			console.log('  - File nodes:', canvasData.nodes.filter(n => n.type === 'file').length);
			console.log('  - Text nodes:', canvasData.nodes.filter(n => n.type === 'text').length);

			// Get all file paths already on canvas
			const existingFilePaths = new Set<string>();
			for (const node of canvasData.nodes) {
				if (node.type === "file" && node.file) {
					existingFilePaths.add(node.file);
				}
			}
			console.log('Existing file paths on canvas:', existingFilePaths.size);

			// Get all entity IDs already on canvas (read from frontmatter of existing nodes)
			const existingEntityIds = new Set<string>();
			for (const node of canvasData.nodes) {
				if (node.type === "file" && node.file) {
					const file = this.app.vault.getAbstractFileByPath(node.file);
					if (file instanceof TFile) {
						try {
							const content = await this.app.vault.read(file);
							const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
							if (fmMatch) {
								const idMatch = fmMatch[1].match(/^id:\s*(.+)$/m);
								if (idMatch) {
									existingEntityIds.add(idMatch[1].trim());
								}
							}
						} catch (e) {
							// Ignore read errors for existing nodes
						}
					}
				}
			}
			console.log('Existing entity IDs on canvas:', existingEntityIds.size);

			// Entity types to scan for (V2 schema)
			const entityTypes = ['milestone', 'story', 'task', 'decision', 'document', 'feature'];

			// Node sizes by entity type
			const nodeSizes: Record<string, { width: number; height: number }> = {
				milestone: { width: 280, height: 200 },
				story: { width: 200, height: 150 },
				task: { width: 160, height: 100 },
				decision: { width: 180, height: 120 },
				document: { width: 200, height: 150 },
				feature: { width: 300, height: 220 },
			};

			// Colors by entity type (Obsidian canvas colors 1-6)
			const entityColors: Record<string, string> = {
				milestone: "6",    // purple
				story: "3",        // blue
				task: "2",         // green
				decision: "4",     // orange
				document: "5",     // yellow
				feature: "1",      // red
			};

			console.log('\n=== STAGE 3: SCAN VAULT FOR ENTITIES ===');
			// Scan all markdown files (excluding archive folder)
			const allFilesRaw = this.app.vault.getMarkdownFiles();
			// Check for archive folder - handles both "archive/" at root and "/archive/" in subfolders
			const allFiles = allFilesRaw.filter(f => !f.path.includes('/archive/') && !f.path.startsWith('archive/'));
			console.log('Total markdown files in vault:', allFilesRaw.length);
			console.log('Files after excluding archive folder:', allFiles.length);

			// Entity info including dependencies and relationships
			interface EntityInfo {
				file: TFile;
				type: string;
				effort?: string;
				id?: string;
				title?: string;
				parent?: string;           // Parent entity ID (for hierarchy)
				dependsOn: string[];       // Entity IDs this depends on
				enables: string[];         // Entity IDs this decision enables/unblocks (legacy)
				affects: string[];         // Entity IDs this decision affects (new, replaces enables)
				// New fields from ENTITY_SCHEMAS.md
				implements: string[];      // DocumentIds this milestone/story implements
				implementedBy: string[];   // StoryIds/MilestoneIds that implement this document
				supersedes?: string;       // DecisionId this decision supersedes
				previousVersion?: string;  // DocumentId of previous version
				docType?: string;          // Document type: spec, adr, vision, guide, research
			}

			const entitiesToAdd: EntityInfo[] = [];

			// Helper to strip quotes from a value
			const stripQuotes = (value: string): string => {
				const trimmed = value.trim();
				// Remove surrounding quotes (single or double)
				if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
					(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
					return trimmed.slice(1, -1);
				}
				return trimmed;
			};

			// Helper to parse YAML array (handles both inline and multiline)
			const parseYamlArray = (frontmatterText: string, key: string): string[] => {
				// Try multiline format first:
				// depends_on:
				//   - S-001
				//   - S-002
				// Use [ \t]* instead of \s* to avoid matching newlines
				const multilineMatch = frontmatterText.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'));
				if (multilineMatch) {
					const items = multilineMatch[1].match(/^[ \t]*-[ \t]*(.+)$/gm);
					if (items) {
						return items.map(item => stripQuotes(item.replace(/^[ \t]*-[ \t]*/, '')));
					}
				}

				// Try inline format: depends_on: [S-001, S-002] or depends_on: ["S-001", "S-002"]
				// Use [ \t]* instead of \s* to avoid matching newlines
				const inlineMatch = frontmatterText.match(new RegExp(`^${key}:[ \\t]*\\[([^\\]]+)\\]`, 'm'));
				if (inlineMatch) {
					return inlineMatch[1].split(',').map(s => stripQuotes(s));
				}

				// Try single value: depends_on: S-001 or depends_on: "S-001"
				// Use [^\n] to explicitly not match newlines
				const singleMatch = frontmatterText.match(new RegExp(`^${key}:[ \\t]*([^\\n\\[]+)$`, 'm'));
				if (singleMatch && singleMatch[1].trim()) {
					return [stripQuotes(singleMatch[1])];
				}

				return [];
			};

			// Track entity IDs seen in this batch to prevent duplicates within the scan
			const batchEntityIds = new Set<string>();
			let skippedDuplicates = 0;

			// Collect ALL entity files for relationship reconciliation
			console.log('\n=== STAGE 3.5: RECONCILE RELATIONSHIPS ===');
			const allEntityFiles: TFile[] = [];
			for (const file of allFiles) {
				try {
					const content = await this.app.vault.read(file);
					const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (fmMatch) {
						const typeMatch = fmMatch[1].match(/^type:\s*(.+)$/m);
						if (typeMatch && entityTypes.includes(typeMatch[1].trim().toLowerCase())) {
							allEntityFiles.push(file);
						}
					}
				} catch (e) {
					// Skip files that can't be read
				}
			}
			console.log(`Found ${allEntityFiles.length} entity files for reconciliation`);

			// Reconcile bidirectional relationships
			const reconcileResult = await reconcileRelationships(this.app, allEntityFiles);
			if (reconcileResult.totalReconciled > 0) {
				console.log(`Reconciled ${reconcileResult.totalReconciled} relationships:`, reconcileResult.details);
				new Notice(`🔗 Reconciled ${reconcileResult.totalReconciled} bidirectional relationships`);
			}

			// Clean up transitively implied dependencies
			const cleanupResult = await cleanTransitiveDependencies(this.app, allEntityFiles);
			if (cleanupResult.totalCleaned > 0) {
				console.log(`Cleaned ${cleanupResult.totalCleaned} transitive dependencies:`, cleanupResult.details);
				new Notice(`🧹 Cleaned ${cleanupResult.totalCleaned} transitive dependencies`);
			}

			// Detect and break cycles in milestone dependencies
			const cycleResult = await detectAndBreakCycles(this.app, allEntityFiles, "milestone");
			if (cycleResult.cyclesFound > 0) {
				console.log(`Broke ${cycleResult.cyclesFound} cycles:`, cycleResult.edgesRemoved);
			}

			for (const file of allFiles) {
				// Skip if already on canvas (by file path)
				if (existingFilePaths.has(file.path)) {
					continue;
				}

				// Read and parse frontmatter
				const content = await this.app.vault.read(file);
				const frontmatter = parseFrontmatter(content);

				// Also try to parse V2 style frontmatter
				const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
				if (!frontmatterMatch) continue;

				const frontmatterText = frontmatterMatch[1];
				// Use [ \t]* instead of \s* to avoid matching newlines (which would capture the next line's value)
				const typeMatch = frontmatterText.match(/^type:[ \t]*(.+)$/m);
				if (!typeMatch) continue;

				const entityType = typeMatch[1].trim().toLowerCase();
				if (!entityTypes.includes(entityType)) continue;



				// Skip archived items (status: archived or archived: true)
				const statusMatch = frontmatterText.match(/^status:[ \t]*(.+)$/m);
				const archivedMatch = frontmatterText.match(/^archived:[ \t]*(.+)$/m);
				const isArchived =
					statusMatch?.[1]?.trim().toLowerCase() === 'archived' ||
					archivedMatch?.[1]?.trim().toLowerCase() === 'true';
				if (isArchived) {
					console.log(`Skipping archived entity: ${file.path}`);
					continue;
				}

				// Extract effort and other metadata
				// Use [ \t]* instead of \s* to avoid matching newlines
				const effortMatch = frontmatterText.match(/^effort:[ \t]*(.+)$/m);
				const idMatch = frontmatterText.match(/^id:[ \t]*(.+)$/m);
				const titleMatch = frontmatterText.match(/^title:[ \t]*["']?(.+?)["']?[ \t]*$/m);
				// For parent, use (.*)$ to allow empty values (just whitespace after colon)
				const parentMatch = frontmatterText.match(/^parent:[ \t]*(.+)$/m);

				const entityId = idMatch?.[1]?.trim();

				// Skip if entity ID already exists on canvas
				if (entityId && existingEntityIds.has(entityId)) {
					console.log(`Skipping duplicate entity ID (already on canvas): ${entityId} in ${file.path}`);
					skippedDuplicates++;
					continue;
				}

				// Skip if entity ID already seen in this batch
				if (entityId && batchEntityIds.has(entityId)) {
					console.log(`Skipping duplicate entity ID (duplicate in vault): ${entityId} in ${file.path}`);
					skippedDuplicates++;
					continue;
				}

				// Track this entity ID
				if (entityId) {
					batchEntityIds.add(entityId);
				}

				// Parse depends_on array
				const dependsOn = parseYamlArray(frontmatterText, 'depends_on');

				// Parse enables array (for decisions - legacy, migrating to affects)
				const enables = parseYamlArray(frontmatterText, 'enables');

				// Parse affects array (for decisions - new field, replaces enables)
				const affects = parseYamlArray(frontmatterText, 'affects');

				// Parse implements array (for milestones/stories -> documents)
				const implementsArr = parseYamlArray(frontmatterText, 'implements');

				// Parse implemented_by array (for documents -> stories/milestones)
				const implementedBy = parseYamlArray(frontmatterText, 'implemented_by');

				// Parse supersedes (for decisions) - use [ \t]* to avoid matching newlines
				const supersedesMatch = frontmatterText.match(/^supersedes:[ \t]*(.+)$/m);
				const supersedes = supersedesMatch ? stripQuotes(supersedesMatch[1]) : undefined;

				// Parse previous_version (for documents) - use [ \t]* to avoid matching newlines
				const previousVersionMatch = frontmatterText.match(/^previous_version:[ \t]*(.+)$/m);
				const previousVersion = previousVersionMatch ? stripQuotes(previousVersionMatch[1]) : undefined;

				// Parse doc_type (for documents) - use [ \t]* to avoid matching newlines
				const docTypeMatch = frontmatterText.match(/^doc_type:[ \t]*(.+)$/m);
				const docType = docTypeMatch ? stripQuotes(docTypeMatch[1]) : undefined;

				entitiesToAdd.push({
					file,
					type: entityType,
					effort: effortMatch?.[1]?.trim(),
					id: entityId,
					title: titleMatch?.[1]?.trim() || file.basename,
					parent: parentMatch ? stripQuotes(parentMatch[1]) : undefined,
					dependsOn,
					enables,
					affects,
					implements: implementsArr,
					implementedBy,
					supersedes,
					previousVersion,
					docType,
				});
			}

			if (skippedDuplicates > 0) {
				console.log(`Skipped ${skippedDuplicates} duplicate entities`);
			}

			console.log('Entities found to add:', entitiesToAdd.length);
			if (entitiesToAdd.length > 0) {
				console.table(entitiesToAdd.map(e => ({
					path: e.file.path,
					type: e.type,
					id: e.id,
					parent: e.parent || '-',
					dependsOn: e.dependsOn.length > 0 ? e.dependsOn.join(', ') : '-'
				})));
			}

			if (entitiesToAdd.length === 0) {
				console.log('No entities to add, exiting');
				console.groupEnd();
				new Notice("No new entities found to add to canvas");
				return;
			}

			// Group entities by type for organized layout
			const entitiesByType: Record<string, typeof entitiesToAdd> = {};
			for (const entity of entitiesToAdd) {
				if (!entitiesByType[entity.type]) {
					entitiesByType[entity.type] = [];
				}
				entitiesByType[entity.type].push(entity);
			}
			console.log('Entities by type:', Object.fromEntries(Object.entries(entitiesByType).map(([k, v]) => [k, v.length])));

			console.log('\n=== STAGE 4: CREATE NODE OBJECTS (GRAPH LAYOUT) ===');
			// Graph-based layout using topological sort on dependencies
			// Nodes are positioned in layers based on dependency depth
			const nodeWidth = 300;
			const nodeHeight = 200;
			const horizontalGap = 80;
			const verticalGap = 120;
			const startX = 50;
			const startY = 50;

			const newNodes: CanvasNode[] = [];

			// Map entity IDs to node info for edge creation
			const entityNodeMap = new Map<string, {
				nodeId: string;
				filePath: string;
				parent?: string;
				dependsOn: string[];
				enables: string[];  // legacy
				affects: string[];  // new, replaces enables
				implements: string[];
				implementedBy: string[];
				supersedes?: string;
				previousVersion?: string;
			}>();

			// Build entity lookup map
			const entityById = new Map<string, typeof entitiesToAdd[0]>();
			for (const entity of entitiesToAdd) {
				if (entity.id) {
					entityById.set(entity.id, entity);
				}
			}

			// Calculate dependency depth for each entity (longest path from a root)
			// Roots are entities with no dependencies
			const depthCache = new Map<string, number>();

			const calculateDepth = (entityId: string, visited: Set<string> = new Set()): number => {
				if (depthCache.has(entityId)) return depthCache.get(entityId)!;
				if (visited.has(entityId)) return 0; // Cycle detected, break it

				visited.add(entityId);
				const entity = entityById.get(entityId);
				if (!entity) return 0;

				// Depth is based on dependencies (what this entity depends on)
				// Also consider parent relationship
				let maxDepDep = -1;
				for (const depId of entity.dependsOn) {
					if (entityById.has(depId)) {
						maxDepDep = Math.max(maxDepDep, calculateDepth(depId, new Set(visited)));
					}
				}

				// Parent relationship also contributes to depth
				if (entity.parent && entityById.has(entity.parent)) {
					maxDepDep = Math.max(maxDepDep, calculateDepth(entity.parent, new Set(visited)));
				}

				const depth = maxDepDep + 1;
				depthCache.set(entityId, depth);
				return depth;
			};

			// Calculate depth for all entities
			for (const entity of entitiesToAdd) {
				if (entity.id) {
					calculateDepth(entity.id);
				}
			}

			// Group entities by depth (layer)
			const entitiesByDepth = new Map<number, typeof entitiesToAdd>();
			for (const entity of entitiesToAdd) {
				const depth = entity.id ? (depthCache.get(entity.id) || 0) : 0;
				if (!entitiesByDepth.has(depth)) {
					entitiesByDepth.set(depth, []);
				}
				entitiesByDepth.get(depth)!.push(entity);
			}

			// Sort depths
			const depths = Array.from(entitiesByDepth.keys()).sort((a, b) => a - b);
			console.log('Graph layers:', depths.length, 'depths:', depths);

			// Hierarchical graph layout: milestones centered, children below their parents
			// Track positions for alignment
			const entityPositions = new Map<string, { x: number; y: number }>();

			// Row heights for each type level
			const typeRows: Record<string, number> = {
				'milestone': 0,
				'story': 1,
				'task': 2,
				'decision': 3,
				'document': 4,
			};

			// Get entities by type
			const milestones = entitiesToAdd.filter(e => e.type === 'milestone');
			const stories = entitiesToAdd.filter(e => e.type === 'story');
			const tasks = entitiesToAdd.filter(e => e.type === 'task');
			const others = entitiesToAdd.filter(e => !['milestone', 'story', 'task'].includes(e.type));

			// Sort milestones by ID
			milestones.sort((a, b) => {
				if (a.id && b.id) return a.id.localeCompare(b.id);
				return a.file.basename.localeCompare(b.file.basename);
			});

			// Build children map (parent -> children)
			const childrenOf = new Map<string, typeof entitiesToAdd>();
			for (const entity of entitiesToAdd) {
				if (entity.parent) {
					if (!childrenOf.has(entity.parent)) {
						childrenOf.set(entity.parent, []);
					}
					childrenOf.get(entity.parent)!.push(entity);
				}
			}

			// Sort children: those with dependencies first, then by ID
			for (const [parentId, children] of childrenOf) {
				children.sort((a, b) => {
					const aHasDeps = a.dependsOn.length > 0 ? 1 : 0;
					const bHasDeps = b.dependsOn.length > 0 ? 1 : 0;
					if (bHasDeps !== aHasDeps) return bHasDeps - aHasDeps;
					if (a.id && b.id) return a.id.localeCompare(b.id);
					return a.file.basename.localeCompare(b.file.basename);
				});
			}

			// Calculate width needed for each milestone's subtree
			const getSubtreeWidth = (entityId: string): number => {
				const children = childrenOf.get(entityId) || [];
				if (children.length === 0) return nodeWidth;

				let totalWidth = 0;
				for (const child of children) {
					if (child.id) {
						totalWidth += getSubtreeWidth(child.id) + horizontalGap;
					} else {
						totalWidth += nodeWidth + horizontalGap;
					}
				}
				return Math.max(nodeWidth, totalWidth - horizontalGap);
			};

			// Place milestones horizontally, spaced by their subtree width
			let currentX = startX;
			const milestoneY = startY;

			for (const milestone of milestones) {
				const subtreeWidth = milestone.id ? getSubtreeWidth(milestone.id) : nodeWidth;
				const milestoneX = currentX + (subtreeWidth - nodeWidth) / 2; // Center milestone over its subtree

				if (milestone.id) {
					entityPositions.set(milestone.id, { x: milestoneX, y: milestoneY });
				}

				const size = nodeSizes['milestone'] || { width: nodeWidth, height: nodeHeight };
				const color = entityColors['milestone'];

				const node = createNode(
					"file",
					milestoneX,
					milestoneY,
					size.width,
					size.height,
					{
						file: milestone.file.path,
						color: color,
						metadata: {
							plugin: "canvas-project-manager",
							shape: "milestone",
							entityId: milestone.id,
						},
					}
				);
				newNodes.push(node);

				if (milestone.id) {
					entityNodeMap.set(milestone.id, {
						nodeId: node.id,
						filePath: milestone.file.path,
						parent: milestone.parent,
						dependsOn: milestone.dependsOn,
						enables: milestone.enables,
						affects: milestone.affects,
						implements: milestone.implements,
						implementedBy: milestone.implementedBy,
						supersedes: milestone.supersedes,
						previousVersion: milestone.previousVersion,
					});
				}

				currentX += subtreeWidth + horizontalGap * 2;
			}

			// Place children recursively under their parents
			const placeChildren = (parentId: string, parentX: number, rowLevel: number) => {
				const children = childrenOf.get(parentId) || [];
				if (children.length === 0) return;

				const rowY = startY + rowLevel * (nodeHeight + verticalGap);

				// Calculate total width of children
				let totalChildWidth = 0;
				for (const child of children) {
					const childSubtreeWidth = child.id ? getSubtreeWidth(child.id) : nodeWidth;
					totalChildWidth += childSubtreeWidth + horizontalGap;
				}
				totalChildWidth -= horizontalGap; // Remove last gap

				// Start position to center children under parent
				let childX = parentX - totalChildWidth / 2 + nodeWidth / 2;

				for (const child of children) {
					const childSubtreeWidth = child.id ? getSubtreeWidth(child.id) : nodeWidth;
					const childCenterX = childX + (childSubtreeWidth - nodeWidth) / 2;

					if (child.id) {
						entityPositions.set(child.id, { x: childCenterX, y: rowY });
					}

					const size = nodeSizes[child.type] || { width: nodeWidth, height: nodeHeight };
					const color = entityColors[child.type];

					let nodeColor = color;
					if (child.effort && this.settings.effortColorMap[child.effort]) {
						nodeColor = this.settings.effortColorMap[child.effort];
					}

					const node = createNode(
						"file",
						childCenterX,
						rowY,
						size.width,
						size.height,
						{
							file: child.file.path,
							color: nodeColor,
							metadata: {
								plugin: "canvas-project-manager",
								shape: child.type,
								entityId: child.id,
							},
						}
					);
					newNodes.push(node);

					if (child.id) {
						entityNodeMap.set(child.id, {
							nodeId: node.id,
							filePath: child.file.path,
							parent: child.parent,
							dependsOn: child.dependsOn,
							enables: child.enables,
							affects: child.affects,
							implements: child.implements,
							implementedBy: child.implementedBy,
							supersedes: child.supersedes,
							previousVersion: child.previousVersion,
						});

						// Recursively place this child's children
						placeChildren(child.id, childCenterX, rowLevel + 1);
					}

					childX += childSubtreeWidth + horizontalGap;
				}
			};

			// Place children of each milestone
			for (const milestone of milestones) {
				if (milestone.id) {
					const pos = entityPositions.get(milestone.id);
					if (pos) {
						placeChildren(milestone.id, pos.x, 1);
					}
				}
			}

			// Place orphans (no parent) at the end - these go last
			const orphans = entitiesToAdd.filter(e =>
				!e.parent && e.type !== 'milestone' && !entityNodeMap.has(e.id || '')
			);

			if (orphans.length > 0) {
				// Sort: items with dependencies first, then by type, then by ID
				orphans.sort((a, b) => {
					const aHasDeps = a.dependsOn.length > 0 ? 1 : 0;
					const bHasDeps = b.dependsOn.length > 0 ? 1 : 0;
					if (bHasDeps !== aHasDeps) return bHasDeps - aHasDeps;

					const typeOrder = ['story', 'task', 'decision', 'document'];
					const aTypeIdx = typeOrder.indexOf(a.type);
					const bTypeIdx = typeOrder.indexOf(b.type);
					if (aTypeIdx !== bTypeIdx) return aTypeIdx - bTypeIdx;

					if (a.id && b.id) return a.id.localeCompare(b.id);
					return a.file.basename.localeCompare(b.file.basename);
				});

				// Place orphans in a row at the bottom right
				const orphanStartX = currentX;
				const orphanY = startY + 4 * (nodeHeight + verticalGap); // Below main content

				let orphanX = orphanStartX;
				for (const orphan of orphans) {
					const size = nodeSizes[orphan.type] || { width: nodeWidth, height: nodeHeight };
					const color = entityColors[orphan.type];

					let nodeColor = color;
					if (orphan.effort && this.settings.effortColorMap[orphan.effort]) {
						nodeColor = this.settings.effortColorMap[orphan.effort];
					}

					const node = createNode(
						"file",
						orphanX,
						orphanY,
						size.width,
						size.height,
						{
							file: orphan.file.path,
							color: nodeColor,
							metadata: {
								plugin: "canvas-project-manager",
								shape: orphan.type,
								entityId: orphan.id,
							},
						}
					);
					newNodes.push(node);

					if (orphan.id) {
						entityNodeMap.set(orphan.id, {
							nodeId: node.id,
							filePath: orphan.file.path,
							parent: orphan.parent,
							dependsOn: orphan.dependsOn,
							enables: orphan.enables,
							affects: orphan.affects,
							implements: orphan.implements,
							implementedBy: orphan.implementedBy,
							supersedes: orphan.supersedes,
							previousVersion: orphan.previousVersion,
						});
					}

					orphanX += size.width + horizontalGap;
				}
			}

			console.log('Created', newNodes.length, 'node objects');
			console.log('Entity node map:', entityNodeMap.size, 'entries');
			if (newNodes.length > 0) {
				console.log('Sample node:', JSON.stringify(newNodes[0], null, 2));
			}

			console.log('\n=== STAGE 5: FILE-BASED APPROACH (NODES + EDGES TOGETHER) ===');
			this.isUpdatingCanvas = true;
			console.log('isUpdatingCanvas set to TRUE');

			// IMPORTANT: Close canvas views FIRST to prevent in-memory state from overwriting our changes
			console.log('Closing canvas views to prevent overwrites...');
			const closedLeaves = await closeCanvasViews(this.app, canvasFile);
			console.log('Closed', closedLeaves.length, 'canvas views');

			// Small delay to ensure any pending saves complete
			await new Promise(resolve => setTimeout(resolve, 100));

			// Load current canvas data - we'll add both nodes AND edges, then save once
			const canvasDataForEdges = await loadCanvasData(this.app, canvasFile);
			console.log('Current canvas has', canvasDataForEdges.nodes.length, 'nodes and', canvasDataForEdges.edges.length, 'edges');

			// Add all new nodes to canvas data
			for (const node of newNodes) {
				addNode(canvasDataForEdges, node);
			}
			console.log('After adding new nodes:', canvasDataForEdges.nodes.length, 'nodes')

			// Build a map of entity ID -> canvas node ID for ALL nodes on canvas
			// This includes both newly added nodes and existing nodes
			const allEntityToNodeMap = new Map<string, string>();

			// Also build a complete map of all entities with their dependencies (new + existing)
			const allEntityDependencies = new Map<string, {
				nodeId: string;
				filePath: string;
				parent?: string;
				dependsOn: string[];
				enables: string[];  // legacy
				affects: string[];  // new, replaces enables
				implements: string[];
				implementedBy: string[];
				supersedes?: string;
				previousVersion?: string;
				isNew: boolean;
			}>();

			// First, add our newly created nodes
			for (const [entityId, info] of entityNodeMap.entries()) {
				allEntityToNodeMap.set(entityId, info.nodeId);
				allEntityDependencies.set(entityId, {
					...info,
					isNew: true,
				});
			}

			// Then, scan existing nodes for entity IDs AND their dependencies
			console.log('Scanning existing nodes for dependencies...');

			// Helper to strip quotes from a value
			const stripQuotesLocal2 = (value: string): string => {
				const trimmed = value.trim();
				if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
					(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
					return trimmed.slice(1, -1);
				}
				return trimmed;
			};

			// Helper to parse YAML array - use [ \t]* instead of \s* to avoid matching newlines
			const parseYamlArrayLocal = (text: string, key: string): string[] => {
				const multilineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'));
				if (multilineMatch) {
					const items = multilineMatch[1].match(/^[ \t]*-[ \t]*(.+)$/gm);
					if (items) {
						return items.map(item => stripQuotesLocal2(item.replace(/^[ \t]*-[ \t]*/, '')));
					}
				}
				const inlineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\[([^\\]]+)\\]`, 'm'));
				if (inlineMatch) {
					return inlineMatch[1].split(',').map(s => stripQuotesLocal2(s));
				}
				const singleMatch = text.match(new RegExp(`^${key}:[ \\t]*([^\\n\\[]+)$`, 'm'));
				if (singleMatch && singleMatch[1].trim()) {
					return [stripQuotesLocal2(singleMatch[1])];
				}
				return [];
			};

			for (const node of canvasDataForEdges.nodes) {
				let entityId: string | undefined;

				// First check metadata
				if (node.metadata?.entityId && typeof node.metadata.entityId === 'string') {
					entityId = node.metadata.entityId;
				}

				// For file nodes, read entity ID from frontmatter (not filename)
				if (!entityId && node.type === 'file' && node.file) {
					const file = this.app.vault.getAbstractFileByPath(node.file);
					if (file instanceof TFile) {
						try {
							const content = await this.app.vault.read(file);
							const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
							if (frontmatterMatch) {
								const frontmatterText = frontmatterMatch[1];
								const idMatch = frontmatterText.match(/^id:\s*(.+)$/m);
								if (idMatch) {
									entityId = idMatch[1].trim();
								}

								// If we found an entity ID, also read dependencies
								if (entityId && !entityNodeMap.has(entityId)) {
									// Use [ \t]* instead of \s* to avoid matching newlines
									const parentMatch = frontmatterText.match(/^parent:[ \t]*(.+)$/m);
									const dependsOn = parseYamlArrayLocal(frontmatterText, 'depends_on');
									const enables = parseYamlArrayLocal(frontmatterText, 'enables');
									const affects = parseYamlArrayLocal(frontmatterText, 'affects');
									const implementsArr = parseYamlArrayLocal(frontmatterText, 'implements');
									const implementedBy = parseYamlArrayLocal(frontmatterText, 'implemented_by');
									const supersedesMatch = frontmatterText.match(/^supersedes:[ \t]*(.+)$/m);
									const previousVersionMatch = frontmatterText.match(/^previous_version:[ \t]*(.+)$/m);

									allEntityDependencies.set(entityId, {
										nodeId: node.id,
										filePath: node.file,
										parent: parentMatch?.[1]?.trim(),
										dependsOn,
										enables,
										affects,
										implements: implementsArr,
										implementedBy,
										supersedes: supersedesMatch?.[1]?.trim(),
										previousVersion: previousVersionMatch?.[1]?.trim(),
										isNew: false,
									});
								}
							}
						} catch (e) {
							console.warn(`Failed to read frontmatter for existing node: ${node.file}`, e);
						}
					}
				}

				if (entityId) {
					allEntityToNodeMap.set(entityId, node.id);
				}
			}
			console.log('Entity to node mapping:', allEntityToNodeMap.size, 'entries');
			console.log('Entities with dependencies:', allEntityDependencies.size, '(new:', entityNodeMap.size, ', existing:', allEntityDependencies.size - entityNodeMap.size, ')');

			// ========================================================================
			// Transitive Reduction: Remove redundant dependencies
			// If A → B → C exists, remove direct A → C edge
			// ========================================================================
			const performTransitiveReduction = (
				entities: Map<string, { dependsOn: string[]; [key: string]: unknown }>
			): Map<string, string[]> => {
				// Build adjacency list for depends_on
				const graph = new Map<string, Set<string>>();
				for (const [entityId, info] of entities) {
					graph.set(entityId, new Set(info.dependsOn));
				}

				// For each entity, check if any dependency is reachable through another dependency
				const reducedDeps = new Map<string, string[]>();

				for (const [entityId, deps] of graph) {
					const directDeps = [...deps];
					const redundant = new Set<string>();

					// For each direct dependency, check if it's reachable through another direct dependency
					for (const dep of directDeps) {
						// BFS/DFS from other direct dependencies to see if we can reach 'dep'
						for (const otherDep of directDeps) {
							if (otherDep === dep) continue;

							// Check if 'dep' is reachable from 'otherDep' (transitively)
							const visited = new Set<string>();
							const queue = [otherDep];

							while (queue.length > 0) {
								const current = queue.shift()!;
								if (visited.has(current)) continue;
								visited.add(current);

								const currentDeps = graph.get(current);
								if (currentDeps) {
									if (currentDeps.has(dep)) {
										// 'dep' is reachable from 'otherDep', so direct edge to 'dep' is redundant
										redundant.add(dep);
										break;
									}
									for (const next of currentDeps) {
										if (!visited.has(next)) {
											queue.push(next);
										}
									}
								}
							}

							if (redundant.has(dep)) break;
						}
					}

					// Keep only non-redundant dependencies
					const kept = directDeps.filter(d => !redundant.has(d));
					reducedDeps.set(entityId, kept);

					if (redundant.size > 0) {
						console.log(`[Transitive Reduction] ${entityId}: removed redundant deps [${[...redundant].join(', ')}], kept [${kept.join(', ')}]`);
					}
				}

				return reducedDeps;
			};

			// Apply transitive reduction to depends_on
			const reducedDependsOn = performTransitiveReduction(allEntityDependencies);

			// Create edges for ALL entities (new and existing)
			const newEdges: CanvasEdge[] = [];
			let edgesSkipped = 0;
			let edgesFromNewNodes = 0;
			let edgesFromExistingNodes = 0;
			let edgesRemovedByReduction = 0;

			for (const [entityId, info] of allEntityDependencies.entries()) {
				const sourceNodeId = info.nodeId;

				// Use reduced dependencies instead of original
				const reducedDeps = reducedDependsOn.get(entityId) || [];
				edgesRemovedByReduction += info.dependsOn.length - reducedDeps.length;

				// Create edges for depends_on relationships (after transitive reduction)
				for (const depId of reducedDeps) {
					const targetNodeId = allEntityToNodeMap.get(depId);
					if (targetNodeId) {
						// Check if edge already exists
						if (!edgeExists(canvasDataForEdges, targetNodeId, sourceNodeId)) {
							// Edge goes FROM dependency TO this node (A depends on B = B --> A)
							// Visual: dependency --> dependent
							const edge = createEdge(targetNodeId, sourceNodeId, undefined, 'right', 'left');
							newEdges.push(edge);
							if (info.isNew) edgesFromNewNodes++; else edgesFromExistingNodes++;
						} else {
							edgesSkipped++;
						}
					} else {
						// Target not on canvas - skip silently
					}
				}

				// Create edge for parent relationship
				if (info.parent) {
					const parentNodeId = allEntityToNodeMap.get(info.parent);
					if (parentNodeId) {
						// Check if edge already exists
						if (!edgeExists(canvasDataForEdges, sourceNodeId, parentNodeId)) {
							// Edge goes FROM child TO parent (child belongs to parent)
							// No label for cleaner visual
							const edge = createEdge(sourceNodeId, parentNodeId, undefined, 'top', 'bottom');
							newEdges.push(edge);
							if (info.isNew) edgesFromNewNodes++; else edgesFromExistingNodes++;
						} else {
							edgesSkipped++;
						}
					} else {
						// Parent not on canvas - skip silently
					}
				}

				// Create edges for affects relationships (decision -> affected entity)
				// Also handle legacy 'enables' field for backwards compatibility
				const affectedIds = [...(info.affects || []), ...(info.enables || [])];
				const seenAffectedIds = new Set<string>();
				for (const affectedId of affectedIds) {
					// Skip duplicates (in case same ID is in both enables and affects)
					if (seenAffectedIds.has(affectedId)) continue;
					seenAffectedIds.add(affectedId);

					const affectedNodeId = allEntityToNodeMap.get(affectedId);
					if (affectedNodeId) {
						// Check if edge already exists
						if (!edgeExists(canvasDataForEdges, sourceNodeId, affectedNodeId)) {
							// Edge goes FROM decision TO affected entity (decision affects the entity)
							// Visual: decision --> affected entity
							const edge = createEdge(sourceNodeId, affectedNodeId, undefined, 'right', 'left');
							newEdges.push(edge);
							if (info.isNew) edgesFromNewNodes++; else edgesFromExistingNodes++;
						} else {
							edgesSkipped++;
						}
					}
				}

				// Create edges for implements relationships (document -> milestone/story)
				// Edge goes FROM document TO implementer (doc flows into implementation)
				// Visual: document --> milestone/story (spec is implemented by work)
				for (const docId of info.implements || []) {
					const docNodeId = allEntityToNodeMap.get(docId);
					if (docNodeId) {
						if (!edgeExists(canvasDataForEdges, docNodeId, sourceNodeId)) {
							// Edge: DOC --> M/S (document is upstream of implementer)
							const edge = createEdge(docNodeId, sourceNodeId, undefined, 'right', 'left');
							newEdges.push(edge);
							if (info.isNew) edgesFromNewNodes++; else edgesFromExistingNodes++;
						} else {
							edgesSkipped++;
						}
					}
				}

				// Create edges for implemented_by relationships (feature/document -> story/milestone)
				// Edge goes FROM feature/document TO implementer
				for (const implId of info.implementedBy || []) {
					const implNodeId = allEntityToNodeMap.get(implId);
					if (implNodeId) {
						if (!edgeExists(canvasDataForEdges, sourceNodeId, implNodeId)) {
							// Edge: Feature/Doc --> M/S (feature/document is upstream of implementer)
							const edge = createEdge(sourceNodeId, implNodeId, undefined, 'right', 'left');
							newEdges.push(edge);
							if (info.isNew) edgesFromNewNodes++; else edgesFromExistingNodes++;
						} else {
							edgesSkipped++;
						}
					}
				}

				// Create edges for supersedes relationships (decision -> superseded decision)
				if (info.supersedes) {
					const supersededNodeId = allEntityToNodeMap.get(info.supersedes);
					if (supersededNodeId) {
						if (!edgeExists(canvasDataForEdges, sourceNodeId, supersededNodeId)) {
							// Visual: new decision --> old decision (supersedes)
							const edge = createEdge(sourceNodeId, supersededNodeId, undefined, 'right', 'left');
							newEdges.push(edge);
							if (info.isNew) edgesFromNewNodes++; else edgesFromExistingNodes++;
						} else {
							edgesSkipped++;
						}
					}
				}

				// Create edges for previous_version relationships (document -> previous version)
				if (info.previousVersion) {
					const prevNodeId = allEntityToNodeMap.get(info.previousVersion);
					if (prevNodeId) {
						if (!edgeExists(canvasDataForEdges, sourceNodeId, prevNodeId)) {
							// Visual: new version --> old version (evolved from)
							const edge = createEdge(sourceNodeId, prevNodeId, undefined, 'right', 'left');
							newEdges.push(edge);
							if (info.isNew) edgesFromNewNodes++; else edgesFromExistingNodes++;
						} else {
							edgesSkipped++;
						}
					}
				}
			}

			console.log('Edge summary:');
			console.log('  - New edges created:', newEdges.length);
			console.log('    - From new nodes:', edgesFromNewNodes);
			console.log('    - From existing nodes:', edgesFromExistingNodes);
			console.log('  - Edges already existed:', edgesSkipped);
			console.log('  - Edges removed by transitive reduction:', edgesRemovedByReduction);

			// Add edges to canvas data
			for (const edge of newEdges) {
				addEdge(canvasDataForEdges, edge);
			}

			// Save everything together (nodes + edges) in one operation
			console.log('\n=== STAGE 5D: SAVE NODES + EDGES TOGETHER ===');
			console.log('Saving canvas with', canvasDataForEdges.nodes.length, 'nodes and', canvasDataForEdges.edges.length, 'edges');
			await saveCanvasData(this.app, canvasFile, canvasDataForEdges);
			console.log('Saved canvas');

			// Verify file BEFORE reopening
			console.log('\n=== STAGE 5E: VERIFY FILE BEFORE REOPEN ===');
			await new Promise(resolve => setTimeout(resolve, 100));
			const preReopenData = await loadCanvasData(this.app, canvasFile);
			console.log('File content BEFORE reopen:', preReopenData.nodes.length, 'nodes,', preReopenData.edges.length, 'edges');

			// Reopen the canvas views we closed at the start
			// Using reopenCanvasViews on the same leaves forces Obsidian to reload from file
			console.log('\n=== STAGE 5F: REOPEN CANVAS ===');
			await reopenCanvasViews(this.app, canvasFile, closedLeaves);
			console.log('Canvas reopened via reopenCanvasViews');

			console.log('\n=== STAGE 6: VERIFY PERSISTENCE ===');
			// Verify by reading from file
			const finalCanvasData = await loadCanvasData(this.app, canvasFile);
			console.log('Final file content:', finalCanvasData.nodes.length, 'nodes,', finalCanvasData.edges.length, 'edges');
			console.log('✅ File saved successfully');

			// Update cache after reload (re-read from file to ensure consistency)
			const currentNodeIds = new Set(finalCanvasData.nodes.map((n: CanvasNode) => n.id));
			this.canvasNodeCache.set(canvasFile.path, currentNodeIds);
			console.log('Cache updated with', currentNodeIds.size, 'node IDs');

			// Keep flag true to prevent deletion detection during auto-refresh
			setTimeout(() => {
				this.isUpdatingCanvas = false;
				console.log('[Canvas Plugin] isUpdatingCanvas set to FALSE');
			}, 500);

			console.log('\n=== COMPLETE ===');
			console.log('Summary:');
			console.log('  - Nodes added:', newNodes.length);
			console.log('  - Edges created:', newEdges.length);
			console.groupEnd();

			const edgeInfo = newEdges.length > 0 ? `, ${newEdges.length} edges` : '';
			new Notice(`✅ Added ${newNodes.length} entities${edgeInfo} to canvas. Reconciling relationships...`);
			this.logger?.info("Populated canvas from vault", {
				nodesAdded: newNodes.length,
				edgesCreated: newEdges.length,
				byType: Object.fromEntries(Object.entries(entitiesByType).map(([k, v]) => [k, v.length]))
			});

			// Reconcile relationships (clean malformed entries, sync bidirectional relationships)
			console.log('\n=== STAGE 7: RECONCILE RELATIONSHIPS ===');
			await this.reconcileAllRelationships();

			// Apply the V4 positioning algorithm
			console.log('\n=== STAGE 8: REPOSITION NODES (V4) ===');
			await this.repositionCanvasNodesV4();

			// Archive cleanup: move archived files and remove archived nodes
			console.log('\n=== STAGE 9: ARCHIVE CLEANUP ===');
			// Get base folder from canvas file path - handle root case
			let baseFolder = canvasFile.parent?.path || '';
			// If baseFolder is "/" or empty, use empty string to match all files
			if (baseFolder === '/' || baseFolder === '') {
				baseFolder = '';
			}
			console.log('Canvas file path:', canvasFile.path);
			console.log('Base folder for archive:', baseFolder || '(root - all files)');

			const movedFiles = await this.moveArchivedFilesToArchive(baseFolder);
			if (movedFiles > 0) {
				new Notice(`📁 Moved ${movedFiles} archived files to archive folders`);
			}

			const removedNodes = await this.removeArchivedNodesFromCanvas(canvasFile);
			if (removedNodes > 0) {
				new Notice(`🗑️ Removed ${removedNodes} archived nodes from canvas`);
			}

		} catch (error) {
			console.error('ERROR in populateCanvasFromVault:', error);
			console.groupEnd();
			this.isUpdatingCanvas = false;
			this.logger?.error("Failed to populate canvas from vault", error);
			new Notice("❌ Failed to populate canvas: " + (error as Error).message);
		}
	}

	/**
	 * Reposition existing canvas nodes using graph layout
	 * Does not create new nodes, only repositions existing ones
	 */
	/**
	 * Reposition canvas nodes using workstream-based layout:
	 * - Milestones are positioned in horizontal lanes by workstream
	 * - Dependencies (stories, tasks) fan out to the LEFT of their milestone
	 * - Cross-stream dependencies are handled by aligning streams
	 */
	private async repositionCanvasNodes(): Promise<void> {
		console.group('[Canvas Plugin] repositionCanvasNodes (workstream-based)');

		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			console.warn('No active canvas file found');
			console.groupEnd();
			new Notice("Please open a canvas file first");
			return;
		}

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			console.log('Canvas has', canvasData.nodes.length, 'nodes,', canvasData.edges.length, 'edges');

			const fileNodes = canvasData.nodes.filter(n => n.type === 'file');
			if (fileNodes.length === 0) {
				new Notice("No file nodes on canvas to reposition");
				console.groupEnd();
				return;
			}

			// Debug: Find DEC-034 in raw canvas data
			const dec034Node = fileNodes.find(n => n.file?.includes('OSS_Retry') || n.metadata?.entityId === 'DEC-034');
			if (dec034Node) {
				console.log('[DEBUG] DEC-034 raw canvas node:', JSON.stringify(dec034Node, null, 2));
			} else {
				console.log('[DEBUG] DEC-034 NOT FOUND in canvas fileNodes!');
			}

			// Layout configuration (exposed as params for tuning)
			const config = {
				milestoneSpacing: 1800,     // Horizontal spacing between milestones (+50%)
				storySpacing: 800,          // Horizontal spacing between milestone and stories (doubled)
				taskSpacing: 700,           // Horizontal spacing between story and tasks (doubled)
				decisionSpacing: 800,       // Horizontal spacing for decisions (left of milestone)
				documentSpacing: 1000,      // Horizontal spacing for documents (left of milestone)
				featureSpacing: 1200,       // Horizontal spacing for features (left of implementers)
				verticalSpacing: 150,       // Vertical spacing between dependency nodes
				decisionVerticalSpacing: 260, // Vertical spacing for decisions (60 + 200)
				documentVerticalSpacing: 460, // Vertical spacing for documents (60 + 400)
				featureVerticalSpacing: 200,  // Vertical spacing for features
				streamSpacing: 400,         // Vertical spacing between workstream lanes
				nodeWidth: 462,
				nodeHeight: 250,
				startX: 500,
				startY: 500,
			};

			// ============================================================
			// STEP 1: Parse node metadata (type, workstream, enables) from frontmatter
			// ============================================================
			type NodeMeta = {
				id: string;
				entityId?: string;  // Entity ID from frontmatter (e.g., DEC-001)
				type: string;       // milestone, story, task, etc.
				workstream: string; // engineering, business, etc.
				filePath: string;
				enables: string[];  // Entity IDs this decision enables/unblocks (legacy)
				affects: string[];  // Entity IDs this decision affects (new, replaces enables)
				blocks: string[];   // Entity IDs this decision blocks
				parent?: string;    // Parent entity ID (e.g., M-021 for a story)
				dependsOn: string[];  // Entity IDs this depends on (for ordering)
				implementedBy: string[];  // Entity IDs that implement this document
			};
			const nodeMeta = new Map<string, NodeMeta>();
			const entityIdToNodeId = new Map<string, string>(); // Map entity ID -> canvas node ID

			// Helper to strip quotes from a value
			const stripQuotesRepos = (value: string): string => {
				const trimmed = value.trim();
				if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
					(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
					return trimmed.slice(1, -1);
				}
				return trimmed;
			};

			// Helper to parse YAML array - use [ \t]* instead of \s* to avoid matching newlines
			const parseYamlArrayRepos = (text: string, key: string): string[] => {
				const multilineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'));
				if (multilineMatch) {
					const items = multilineMatch[1].match(/^[ \t]*-[ \t]*(.+)$/gm);
					if (items) {
						return items.map(item => stripQuotesRepos(item.replace(/^[ \t]*-[ \t]*/, '')));
					}
				}
				const inlineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\[([^\\]]+)\\]`, 'm'));
				if (inlineMatch) {
					return inlineMatch[1].split(',').map(s => stripQuotesRepos(s));
				}
				const singleMatch = text.match(new RegExp(`^${key}:[ \\t]*([^\\n\\[]+)$`, 'm'));
				if (singleMatch && singleMatch[1].trim()) {
					return [stripQuotesRepos(singleMatch[1])];
				}
				return [];
			};

			// Get canvas folder for resolving relative paths
			const canvasFolder = canvasFile.parent?.path || '';
			console.log('[DEBUG] Canvas folder:', canvasFolder);

			for (const node of fileNodes) {
				if (!node.file) continue;
				// Try direct path first, then try with canvas folder prefix
				let file = this.app.vault.getAbstractFileByPath(node.file);
				const directFound = file instanceof TFile;
				if (!directFound && canvasFolder) {
					const prefixedPath = `${canvasFolder}/${node.file}`;
					file = this.app.vault.getAbstractFileByPath(prefixedPath);
					if (node.file.includes('OSS_Retry')) {
						console.log(`[DEBUG DEC-034] Direct path "${node.file}" found: ${directFound}`);
						console.log(`[DEBUG DEC-034] Prefixed path "${prefixedPath}" found: ${file instanceof TFile}`);
					}
				}
				if (!(file instanceof TFile)) {
					console.log(`  [SKIP] File not found: ${node.file}`);
					continue;
				}

				try {
					const content = await this.app.vault.read(file);
					const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (!fmMatch) continue;

					const fmText = fmMatch[1];
					// Use [ \t]* instead of \s* to avoid matching newlines
					const typeMatch = fmText.match(/^type:[ \t]*(.+)$/m);
					const workstreamMatch = fmText.match(/^workstream:[ \t]*(.+)$/m);
					const idMatch = fmText.match(/^id:[ \t]*(.+)$/m);
					const parentMatch = fmText.match(/^parent:[ \t]*(.+)$/m);
					const enables = parseYamlArrayRepos(fmText, 'enables');
					const affectsArr = parseYamlArrayRepos(fmText, 'affects');
					const blocksArr = parseYamlArrayRepos(fmText, 'blocks');
					const dependsOnArr = parseYamlArrayRepos(fmText, 'depends_on');
					const implementedByArr = parseYamlArrayRepos(fmText, 'implemented_by');

					const entityId = idMatch?.[1]?.trim();
					const parent = parentMatch?.[1]?.trim();

					const nodeType = typeMatch?.[1]?.trim().toLowerCase() || 'unknown';

					// Debug: Log DEC-034 specifically
					if (entityId === 'DEC-034') {
						console.log(`[DEBUG DEC-034] Found! type=${nodeType}, affects=[${affectsArr.join(',')}], enables=[${enables.join(',')}]`);
						console.log(`[DEBUG DEC-034] fmText:`, fmText);
					}

					nodeMeta.set(node.id, {
						id: node.id,
						entityId,
						type: nodeType,
						workstream: workstreamMatch?.[1]?.trim().toLowerCase() || 'unassigned',
						filePath: node.file,
						enables,
						affects: affectsArr,
						blocks: blocksArr,
						parent,
						dependsOn: dependsOnArr,
						implementedBy: implementedByArr,
					});

					// Debug: Log decisions with affects
					if (nodeType === 'decision' && affectsArr.length > 0) {
						console.log(`PARSED decision ${entityId}: affects=[${affectsArr.join(',')}]`);
					}

					// Build entity ID -> node ID mapping
					if (entityId) {
						entityIdToNodeId.set(entityId, node.id);
					}
				} catch (e) {
					console.warn('Failed to read frontmatter for node:', node.id, e);
				}
			}

			// ============================================================
			// STEP 2: Build dependency graph (from edges + enables field)
			// ============================================================
			const dependsOn = new Map<string, string[]>();  // nodeId -> [nodes it depends on]
			const dependedBy = new Map<string, string[]>(); // nodeId -> [nodes that depend on it]

			for (const node of fileNodes) {
				dependsOn.set(node.id, []);
				dependedBy.set(node.id, []);
			}

			// Build from canvas edges
			for (const edge of canvasData.edges) {
				// fromNode --> toNode means toNode depends on fromNode
				const deps = dependsOn.get(edge.toNode);
				if (deps && fileNodes.some(n => n.id === edge.fromNode)) {
					deps.push(edge.fromNode);
				}
				const depBy = dependedBy.get(edge.fromNode);
				if (depBy && fileNodes.some(n => n.id === edge.toNode)) {
					depBy.push(edge.toNode);
				}
			}

			// Also build from 'enables' field in frontmatter (for decisions)
			// If decision enables entity X, then X depends on the decision
			for (const [nodeId, meta] of nodeMeta.entries()) {
				if (meta.enables.length > 0) {
					for (const enabledEntityId of meta.enables) {
						const enabledNodeId = entityIdToNodeId.get(enabledEntityId);
						if (enabledNodeId && fileNodes.some(n => n.id === enabledNodeId)) {
							// The enabled entity depends on this decision
							const deps = dependsOn.get(enabledNodeId);
							if (deps && !deps.includes(nodeId)) {
								deps.push(nodeId);
							}
							// This decision is depended on by the enabled entity
							const depBy = dependedBy.get(nodeId);
							if (depBy && !depBy.includes(enabledNodeId)) {
								depBy.push(enabledNodeId);
							}
						}
					}
				}
			}

			console.log('Dependency graph built with enables relationships');

			// ============================================================
			// STEP 3: Identify milestones and group by workstream
			// ============================================================
			const milestones = fileNodes.filter(n => nodeMeta.get(n.id)?.type === 'milestone');
			const nonMilestones = fileNodes.filter(n => nodeMeta.get(n.id)?.type !== 'milestone');

			// Group milestones by workstream
			const milestonesByWorkstream = new Map<string, typeof milestones>();
			for (const m of milestones) {
				const ws = nodeMeta.get(m.id)?.workstream || 'unassigned';
				if (!milestonesByWorkstream.has(ws)) milestonesByWorkstream.set(ws, []);
				milestonesByWorkstream.get(ws)!.push(m);
			}

			console.log('Milestones by workstream:', Object.fromEntries(
				Array.from(milestonesByWorkstream.entries()).map(([k, v]) => [k, v.length])
			));

			// ============================================================
			// STEP 4: Data structures for positioning
			// ============================================================
			type Position = { x: number; y: number };
			type Size = { width: number; height: number };
			type MilestoneBox = {
				position: Position;
				size: Size;
				relativePositions: Map<string, Position>; // dependency nodeId -> relative position
			};
			const tracker = new Map<string, MilestoneBox>();
			type NodePosition = { x: number; y: number; width: number; height: number };
			const finalPositions = new Map<string, NodePosition>();

			// ============================================================
			// STEP 5: For each milestone, calculate its bounding box
			// ============================================================

			// Build a map of parent entity ID -> children node IDs (from frontmatter parent field)
			const childrenByParent = new Map<string, string[]>();
			for (const [nodeId, meta] of nodeMeta.entries()) {
				if (meta.parent) {
					if (!childrenByParent.has(meta.parent)) {
						childrenByParent.set(meta.parent, []);
					}
					childrenByParent.get(meta.parent)!.push(nodeId);
					console.log(`  Child ${meta.entityId} (node ${nodeId}) has parent ${meta.parent}`);
				}
			}
			console.log('Children by parent (from frontmatter):',
				Object.fromEntries(Array.from(childrenByParent.entries()).map(([k, v]) => [k, v.length]))
			);
			// Debug: show all children for each parent
			for (const [parentId, childIds] of childrenByParent.entries()) {
				const childEntityIds = childIds.map(id => nodeMeta.get(id)?.entityId || id);
				console.log(`  Parent ${parentId} has children: ${childEntityIds.join(', ')}`);
			}

			// Get all entities that belong to a milestone (by parent field ONLY)
			// Note: We only use the `parent` field for containment/hierarchy.
			// The `depends_on` field is for sequencing/blocking, not containment.
			const getMilestoneChildren = (parentEntityId: string, visited: Set<string>): string[] => {
				const result: string[] = [];

				// Get children by parent field (the ONLY source of truth for containment)
				const children = childrenByParent.get(parentEntityId) || [];
				for (const childNodeId of children) {
					if (visited.has(childNodeId)) continue;
					visited.add(childNodeId);

					const meta = nodeMeta.get(childNodeId);
					if (meta?.type === 'milestone') continue; // Skip other milestones

					result.push(childNodeId);

					// Recursively get children of this child (for nested hierarchies like story->task)
					if (meta?.entityId) {
						result.push(...getMilestoneChildren(meta.entityId, visited));
					}
				}

				return result;
			};

			// Track which milestone each node belongs to (for later positioning)
			const nodeToMilestone = new Map<string, string>();

			// Track document direction per milestone (opposite of story direction)
			// -1 = documents above milestone, 1 = documents below milestone
			const milestoneDocDirection = new Map<string, number>();

			// Alternating top/bottom flag
			let alternateTop = true;

			for (const [workstream, wsMilestones] of milestonesByWorkstream) {
				console.log(`Processing workstream: ${workstream} with ${wsMilestones.length} milestones`);

				// Sort milestones within workstream by dependency order
				// Milestones that depend on other milestones should be to the right
				const milestoneDeps = new Map<string, string[]>();
				for (const m of wsMilestones) {
					const deps = (dependsOn.get(m.id) || []).filter(depId =>
						nodeMeta.get(depId)?.type === 'milestone'
					);
					milestoneDeps.set(m.id, deps);
				}

				// Topological sort of milestones
				const sortedMilestones: typeof wsMilestones = [];
				const remaining = new Set(wsMilestones.map(m => m.id));

				while (remaining.size > 0) {
					// Find milestones with no remaining dependencies
					let found = false;
					for (const mId of remaining) {
						const deps = milestoneDeps.get(mId) || [];
						const hasUnresolvedDep = deps.some(d => remaining.has(d));
						if (!hasUnresolvedDep) {
							sortedMilestones.push(wsMilestones.find(m => m.id === mId)!);
							remaining.delete(mId);
							found = true;
							break;
						}
					}
					if (!found) {
						// Cycle detected, just add remaining
						for (const mId of remaining) {
							sortedMilestones.push(wsMilestones.find(m => m.id === mId)!);
						}
						break;
					}
				}

				// Process each milestone
				for (const milestone of sortedMilestones) {
					const mId = milestone.id; // Canvas node ID
					const mMeta = nodeMeta.get(mId);
					const mEntityId = mMeta?.entityId; // Entity ID (e.g., M-021)

					// Get all entities belonging to this milestone (by parent field ONLY)
					const allDeps = mEntityId
						? getMilestoneChildren(mEntityId, new Set())
						: [];

					const childEntityIds = allDeps.map(id => nodeMeta.get(id)?.entityId || id);
					console.log(`Milestone ${mEntityId || mId}: found ${allDeps.length} child entities: ${childEntityIds.join(', ')}`);

					// Mark these nodes as belonging to this milestone
					for (const depId of allDeps) {
						if (!nodeToMilestone.has(depId)) {
							nodeToMilestone.set(depId, mId);
						}
					}

					// Separate by type
					const stories = allDeps.filter(id => nodeMeta.get(id)?.type === 'story');
					const tasks = allDeps.filter(id => nodeMeta.get(id)?.type === 'task');
					const decisions = allDeps.filter(id => nodeMeta.get(id)?.type === 'decision');
					let documents = allDeps.filter(id => nodeMeta.get(id)?.type === 'document');
					const features = allDeps.filter(id => nodeMeta.get(id)?.type === 'feature');
					const others = allDeps.filter(id => {
						const t = nodeMeta.get(id)?.type;
						return t !== 'story' && t !== 'task' && t !== 'decision' && t !== 'document' && t !== 'feature';
					});

					// ENHANCEMENT: Also include documents that have implemented_by pointing to this milestone
					// These documents don't have parent field but are implemented by this milestone
					if (mEntityId) {
						for (const [nodeId, meta] of nodeMeta.entries()) {
							if (meta.type !== 'document') continue;
							if (documents.includes(nodeId)) continue; // Already included via parent
							if (!meta.implementedBy?.length) continue;

							// Check if this document is implemented by this milestone
							const implementerMilestones = new Set<string>();
							for (const implEntityId of meta.implementedBy) {
								if (implEntityId.startsWith('M-')) {
									implementerMilestones.add(implEntityId);
								} else {
									// Find the parent milestone of this implementer
									const implNodeId = entityIdToNodeId.get(implEntityId);
									if (implNodeId) {
										const implMeta = nodeMeta.get(implNodeId);
										if (implMeta?.parent) {
											implementerMilestones.add(implMeta.parent);
										}
									}
								}
							}

							// Only include if this milestone is the ONLY implementer (single-milestone doc)
							if (implementerMilestones.size === 1 && implementerMilestones.has(mEntityId)) {
								documents.push(nodeId);
								allDeps.push(nodeId);
								if (!nodeToMilestone.has(nodeId)) {
									nodeToMilestone.set(nodeId, mId);
								}
								console.log(`  Document ${meta.entityId} added to ${mEntityId} via implemented_by`);
							}
						}

						// Also include features that have implemented_by pointing to this milestone
						for (const [nodeId, meta] of nodeMeta.entries()) {
							if (meta.type !== 'feature') continue;
							if (features.includes(nodeId)) continue; // Already included via parent
							if (!meta.implementedBy?.length) continue;

							// Check if this feature is implemented by this milestone
							const implementerMilestones = new Set<string>();
							for (const implEntityId of meta.implementedBy) {
								if (implEntityId.startsWith('M-')) {
									implementerMilestones.add(implEntityId);
								} else {
									// Find the parent milestone of this implementer
									const implNodeId = entityIdToNodeId.get(implEntityId);
									if (implNodeId) {
										const implMeta = nodeMeta.get(implNodeId);
										if (implMeta?.parent) {
											implementerMilestones.add(implMeta.parent);
										}
									}
								}
							}

							// Only include if this milestone is the ONLY implementer (single-milestone feature)
							if (implementerMilestones.size === 1 && implementerMilestones.has(mEntityId)) {
								features.push(nodeId);
								allDeps.push(nodeId);
								if (!nodeToMilestone.has(nodeId)) {
									nodeToMilestone.set(nodeId, mId);
								}
								console.log(`  Feature ${meta.entityId} added to ${mEntityId} via implemented_by`);
							}
						}
					}

					const storyEntityIds = stories.map(id => nodeMeta.get(id)?.entityId || id);
					console.log(`  Stories for ${mEntityId}: ${storyEntityIds.join(', ') || 'none'}`);
					if (mEntityId === 'M-021') {
						console.log(`  DEBUG M-021: childrenByParent.get('M-021') = ${JSON.stringify(childrenByParent.get('M-021'))}`);
					}

					// Calculate relative positions
					// Milestone is at (0, 0) in its local coordinate system
					// Dependencies fan to the LEFT
					const relativePositions = new Map<string, Position>();

					// Position stories to the left of milestone
					// Alternating: this milestone's stories go TOP or BOTTOM
					const storyDirection = alternateTop ? -1 : 1; // -1 = above, 1 = below
					alternateTop = !alternateTop;

					// Track document direction for this milestone (opposite of stories)
					milestoneDocDirection.set(mId, -storyDirection);

					// ============================================================
					// ENHANCEMENT 1: Sort stories by dependency order (topological sort)
					// Stories that depend on other stories should be positioned BELOW them
					// ============================================================
					const sortByDependencies = (nodeIds: string[]): string[] => {
						if (nodeIds.length <= 1) return nodeIds;

						// Build dependency map for these nodes only
						const localDeps = new Map<string, string[]>();
						const nodeEntityIds = new Set(nodeIds.map(id => nodeMeta.get(id)?.entityId).filter(Boolean));

						for (const nodeId of nodeIds) {
							const meta = nodeMeta.get(nodeId);
							if (!meta) continue;
							// Filter to only dependencies within this set
							const deps = (meta.dependsOn || [])
								.filter(depEntityId => nodeEntityIds.has(depEntityId))
								.map(depEntityId => entityIdToNodeId.get(depEntityId))
								.filter((id): id is string => id !== undefined && nodeIds.includes(id));
							localDeps.set(nodeId, deps);
						}

						// Topological sort
						const sorted: string[] = [];
						const remaining = new Set(nodeIds);

						while (remaining.size > 0) {
							let found = false;
							for (const nodeId of remaining) {
								const deps = localDeps.get(nodeId) || [];
								const hasUnresolvedDep = deps.some(d => remaining.has(d));
								if (!hasUnresolvedDep) {
									sorted.push(nodeId);
									remaining.delete(nodeId);
									found = true;
									break;
								}
							}
							if (!found) {
								// Cycle detected, add remaining in original order
								for (const nodeId of nodeIds) {
									if (remaining.has(nodeId)) {
										sorted.push(nodeId);
										remaining.delete(nodeId);
									}
								}
								break;
							}
						}
						return sorted;
					};

					// ============================================================
					// ENHANCEMENT: Adaptive multi-column layout for stories/tasks
					// 1-4 items → 1 column, 5-8 items → 2 columns, 9+ items → 3 columns
					// ============================================================
					const getAdaptiveColumns = (count: number): number => {
						if (count <= 4) return 1;
						if (count <= 8) return 2;
						return 3;
					};

					const positionInGrid = (
						nodeIds: string[],
						baseX: number,
						direction: number,
						columnSpacing: number
					) => {
						const columns = getAdaptiveColumns(nodeIds.length);
						const rows = Math.ceil(nodeIds.length / columns);

						// Position nodes in grid: rightmost column first (closest to milestone)
						// Within each column, top to bottom (or bottom to top based on direction)
						for (let i = 0; i < nodeIds.length; i++) {
							const col = columns - 1 - (i % columns); // Rightmost column = 0, leftmost = columns-1
							const row = Math.floor(i / columns);

							const x = baseX - (col * (config.nodeWidth + columnSpacing));
							const y = direction * (config.nodeHeight / 2 + config.verticalSpacing + row * (config.nodeHeight + config.verticalSpacing));

							relativePositions.set(nodeIds[i], { x, y });
						}
					};

					// Sort stories by dependency order and position in adaptive grid
					const sortedStories = sortByDependencies(stories);
					const storyColumnSpacing = 80; // Gap between story columns
					positionInGrid(sortedStories, -config.storySpacing, storyDirection, storyColumnSpacing);

					// Sort tasks by dependency order and position in adaptive grid
					const sortedTasks = sortByDependencies(tasks);
					const taskColumnSpacing = 80; // Gap between task columns
					positionInGrid(sortedTasks, -config.storySpacing - config.taskSpacing, storyDirection, taskColumnSpacing);

					// Position decisions to the left of milestone (same side as stories/tasks but different spacing)
					let decisionY = storyDirection * (config.nodeHeight / 2 + config.decisionVerticalSpacing);
					for (const decisionId of decisions) {
						relativePositions.set(decisionId, {
							x: -config.decisionSpacing, // Left side of milestone
							y: decisionY,
						});
						decisionY += storyDirection * (config.nodeHeight + config.decisionVerticalSpacing);
					}

					// ============================================================
					// ENHANCEMENT 2: Position documents on OPPOSITE side of stories
					// Documents go below when stories are above, and vice versa
					// Multi-milestone documents are deferred to STEP 8.5
					// Use grid layout for multiple documents
					// ============================================================
					const documentDirection = -storyDirection; // Opposite of stories

					// Filter out multi-milestone documents first
					const singleMilestoneDocuments: string[] = [];
					for (const documentId of documents) {
						const docMeta = nodeMeta.get(documentId);

						// Check if this document has implementers in OTHER milestones
						// If so, defer positioning to after all milestones are placed
						if (docMeta?.implementedBy?.length) {
							const implementerMilestones = new Set<string>();
							for (const implEntityId of docMeta.implementedBy) {
								// Check if implementer is a milestone
								if (implEntityId.startsWith('M-')) {
									implementerMilestones.add(implEntityId);
								} else {
									// Find the parent milestone of this implementer
									const implNodeId = entityIdToNodeId.get(implEntityId);
									if (implNodeId) {
										const implMeta = nodeMeta.get(implNodeId);
										if (implMeta?.parent) {
											implementerMilestones.add(implMeta.parent);
										}
									}
								}
							}

							// If document spans multiple milestones, defer positioning
							if (implementerMilestones.size > 1) {
								console.log(`  Document ${docMeta.entityId} spans ${implementerMilestones.size} milestones - deferring`);
								continue; // Will be positioned in STEP 8.5
							}
						}

						singleMilestoneDocuments.push(documentId);
					}

					// Position documents in a grid (like stories/tasks)
					const documentColumnSpacing = 80;
					positionInGrid(singleMilestoneDocuments, -config.documentSpacing, documentDirection, documentColumnSpacing);

					// ============================================================
					// ENHANCEMENT 3: Position single-parent features as children
					// Features with single implementer in this milestone are positioned here.
					// Multi-milestone features are deferred to STEP 8.6
					// Features are positioned in the same column as stories, AFTER stories
					// ============================================================
					const featureDirection = storyDirection; // Same side as stories

					// Find the furthest story position in the story direction to start features after
					let maxStoryY = 0;
					for (const storyId of stories) {
						const storyPos = relativePositions.get(storyId);
						if (storyPos) {
							if (storyDirection > 0) {
								maxStoryY = Math.max(maxStoryY, storyPos.y + config.nodeHeight);
							} else {
								maxStoryY = Math.min(maxStoryY, storyPos.y);
							}
						}
					}

					// Start features after the last story (with spacing)
					let featureY = maxStoryY + featureDirection * config.featureVerticalSpacing;
					if (stories.length === 0) {
						// No stories, start from milestone center
						featureY = featureDirection * (config.nodeHeight / 2 + config.featureVerticalSpacing);
					}

					// Filter single-milestone features
					const singleMilestoneFeatures: string[] = [];
					for (const featureId of features) {
						const featureMeta = nodeMeta.get(featureId);

						// Check if this feature has implementers in OTHER milestones
						if (featureMeta?.implementedBy?.length) {
							const implementerMilestones = new Set<string>();
							for (const implEntityId of featureMeta.implementedBy) {
								// Check if implementer is a milestone
								if (implEntityId.startsWith('M-')) {
									implementerMilestones.add(implEntityId);
								} else {
									// Find the parent milestone of this implementer
									const implNodeId = entityIdToNodeId.get(implEntityId);
									if (implNodeId) {
										const implMeta = nodeMeta.get(implNodeId);
										if (implMeta?.parent) {
											implementerMilestones.add(implMeta.parent);
										}
									}
								}
							}

							// If feature spans multiple milestones, defer positioning
							if (implementerMilestones.size > 1) {
								console.log(`  Feature ${featureMeta.entityId} spans ${implementerMilestones.size} milestones - deferring`);
								continue; // Will be positioned in STEP 8.6
							}
						}

						singleMilestoneFeatures.push(featureId);
					}

					// Position features after stories in the same column
					for (const featureId of singleMilestoneFeatures) {
						relativePositions.set(featureId, {
							x: -config.storySpacing,
							y: featureY,
						});
						featureY += featureDirection * (config.nodeHeight + config.featureVerticalSpacing);
					}

					// Position other types
					let otherY = -storyDirection * (config.nodeHeight / 2 + config.verticalSpacing);
					for (const otherId of others) {
						relativePositions.set(otherId, {
							x: -config.storySpacing,
							y: otherY,
						});
						otherY += -storyDirection * (config.nodeHeight + config.verticalSpacing);
					}

					// Calculate bounding box size
					let minX = 0, maxX = config.nodeWidth;
					let minY = 0, maxY = config.nodeHeight;

					for (const [, pos] of relativePositions) {
						minX = Math.min(minX, pos.x);
						maxX = Math.max(maxX, pos.x + config.nodeWidth);
						minY = Math.min(minY, pos.y);
						maxY = Math.max(maxY, pos.y + config.nodeHeight);
					}

					const boxWidth = maxX - minX + config.milestoneSpacing;
					const boxHeight = maxY - minY;

					tracker.set(mId, {
						position: { x: 0, y: 0 }, // Will be set later
						size: { width: boxWidth, height: boxHeight },
						relativePositions,
					});

					console.log(`Milestone ${mId}: ${allDeps.length} deps, box size ${boxWidth}x${boxHeight}`);
				}
			}

			// ============================================================
			// STEP 6: Position milestones within each workstream lane
			// ============================================================
			const workstreamLanes = new Map<string, { y: number; height: number }>();
			let currentLaneY = config.startY;

			for (const [workstream, wsMilestones] of milestonesByWorkstream) {
				// Calculate lane height (max of all milestone boxes in this workstream)
				let maxHeight = config.nodeHeight;
				for (const m of wsMilestones) {
					const box = tracker.get(m.id);
					if (box) maxHeight = Math.max(maxHeight, box.size.height);
				}

				workstreamLanes.set(workstream, {
					y: currentLaneY + maxHeight / 2,
					height: maxHeight,
				});

				// Position milestones left to right
				let currentX = config.startX;

				// Re-sort by dependency (same logic as before)
				const milestoneDeps = new Map<string, string[]>();
				for (const m of wsMilestones) {
					const deps = (dependsOn.get(m.id) || []).filter(depId =>
						nodeMeta.get(depId)?.type === 'milestone'
					);
					milestoneDeps.set(m.id, deps);
				}

				const sortedMilestones: typeof wsMilestones = [];
				const remaining = new Set(wsMilestones.map(m => m.id));

				while (remaining.size > 0) {
					let found = false;
					for (const mId of remaining) {
						const deps = milestoneDeps.get(mId) || [];
						const hasUnresolvedDep = deps.some(d => remaining.has(d));
						if (!hasUnresolvedDep) {
							sortedMilestones.push(wsMilestones.find(m => m.id === mId)!);
							remaining.delete(mId);
							found = true;
							break;
						}
					}
					if (!found) {
						for (const mId of remaining) {
							sortedMilestones.push(wsMilestones.find(m => m.id === mId)!);
						}
						break;
					}
				}

				for (const milestone of sortedMilestones) {
					const box = tracker.get(milestone.id);
					if (!box) continue;

					// Milestone position (right side of its box)
					const milestoneX = currentX + box.size.width - config.nodeWidth - config.milestoneSpacing / 2;
					const milestoneY = currentLaneY + maxHeight / 2 - config.nodeHeight / 2;

					box.position = { x: milestoneX, y: milestoneY };

					// Set final position for milestone
					finalPositions.set(milestone.id, {
						x: milestoneX,
						y: milestoneY,
						width: config.nodeWidth,
						height: config.nodeHeight,
					});

					// Set final positions for dependencies (convert relative to absolute)
					for (const [depId, relPos] of box.relativePositions) {
						finalPositions.set(depId, {
							x: milestoneX + relPos.x,
							y: milestoneY + relPos.y,
							width: config.nodeWidth,
							height: config.nodeHeight,
						});
					}

					currentX += box.size.width;
				}

				currentLaneY += maxHeight + config.streamSpacing;
			}

			// ============================================================
			// STEP 7: Handle cross-stream milestone dependencies
			// ============================================================
			// If milestone A (engineering) depends on milestone B (business),
			// ensure B is positioned to the left of A
			for (const milestone of milestones) {
				const mId = milestone.id;
				const mPos = finalPositions.get(mId);
				if (!mPos) continue;

				const deps = dependsOn.get(mId) || [];
				for (const depId of deps) {
					const depMeta = nodeMeta.get(depId);
					if (depMeta?.type !== 'milestone') continue;

					const depPos = finalPositions.get(depId);
					if (!depPos) continue;

					// If dependency is to the right of this milestone, we need to shift
					if (depPos.x >= mPos.x) {
						const shift = depPos.x - mPos.x + config.milestoneSpacing + config.nodeWidth;
						console.log(`Cross-stream: shifting ${mId} right by ${shift} because it depends on ${depId}`);

						// Shift this milestone and all its dependencies
						mPos.x += shift;
						const box = tracker.get(mId);
						if (box) {
							for (const [nodeId] of box.relativePositions) {
								const pos = finalPositions.get(nodeId);
								if (pos) pos.x += shift;
							}
						}
					}
				}
			}

			// ============================================================
			// STEP 8: Position unpositioned documents based on their implementers
			// - Single implementer: position to the LEFT of implementer
			// - Multiple implementers: position BETWEEN them (centered, above)
			// ============================================================
			// Track documents that span multiple milestones for special edge handling
			const multiMilestoneDocuments = new Map<string, { leftmost: string; rightmost: string }>();

			// Track used positions to avoid stacking documents on top of each other
			// Key: "x,y" position string, Value: count of docs at that position
			const usedDocPositions = new Map<string, number>();

			// Find all documents that haven't been positioned yet
			const unpositionedDocs = fileNodes.filter(n => {
				const meta = nodeMeta.get(n.id);
				return meta?.type === 'document' && !finalPositions.has(n.id);
			});

			for (const doc of unpositionedDocs) {
				const meta = nodeMeta.get(doc.id);
				if (!meta?.implementedBy?.length) continue;

				// Find all implementer positions
				const implementerPositions: { entityId: string; nodeId: string; x: number; y: number }[] = [];

				for (const implEntityId of meta.implementedBy) {
					const implNodeId = entityIdToNodeId.get(implEntityId);
					if (!implNodeId) continue;

					const implPos = finalPositions.get(implNodeId);
					if (implPos) {
						implementerPositions.push({
							entityId: implEntityId,
							nodeId: implNodeId,
							x: implPos.x,
							y: implPos.y,
						});
					}
				}

				if (implementerPositions.length === 0) continue;

				// Sort by X position to find leftmost and rightmost
				implementerPositions.sort((a, b) => a.x - b.x);
				const leftmost = implementerPositions[0];
				const rightmost = implementerPositions[implementerPositions.length - 1];

				let docX: number;
				let docY: number;

				if (implementerPositions.length === 1) {
					// SINGLE IMPLEMENTER: Position to the LEFT of the implementer
					// Y offset based on milestone's document direction (opposite of stories)
					docX = leftmost.x - config.documentSpacing - config.nodeWidth;

					// Find the milestone this implementer belongs to
					let implMilestoneId: string | undefined;
					if (leftmost.entityId.startsWith('M-')) {
						implMilestoneId = leftmost.entityId;
					} else {
						// Find parent milestone of this implementer
						const implMeta = nodeMeta.get(leftmost.nodeId);
						implMilestoneId = implMeta?.parent;
					}

					// Get document direction for this milestone
					const docDir = implMilestoneId ? milestoneDocDirection.get(entityIdToNodeId.get(implMilestoneId) || '') : 1;
					const direction = docDir || 1; // Default to below if not found

					// Position document offset from implementer in the document direction
					docY = leftmost.y + direction * (config.nodeHeight / 2 + config.documentVerticalSpacing);

					// Check if this position is already used by another document
					const posKey = `${Math.round(docX)},${Math.round(docY)}`;
					const existingCount = usedDocPositions.get(posKey) || 0;
					if (existingCount > 0) {
						// Offset this document in the stacking direction (use smaller spacing for doc-to-doc)
						docY += direction * existingCount * (config.nodeHeight + config.verticalSpacing);
					}
					usedDocPositions.set(posKey, existingCount + 1);

					console.log(`  Single-implementer document ${meta.entityId} positioned LEFT of ${leftmost.entityId} (dir=${direction}, offset=${existingCount})`);
				} else {
					// MULTIPLE IMPLEMENTERS: Position BETWEEN them (centered)
					docX = (leftmost.x + rightmost.x + config.nodeWidth) / 2 - config.nodeWidth / 2;

					// ============================================================
					// ENHANCEMENT: Consider full bounding boxes of milestones
					// including their children (stories/tasks) to avoid overlap
					// ============================================================

					// Calculate the actual occupied Y range considering milestone bounding boxes
					let actualMinY = Infinity;
					let actualMaxY = -Infinity;

					for (const impl of implementerPositions) {
						// Find the milestone this implementer belongs to
						let milestoneNodeId: string | undefined;
						if (impl.entityId.startsWith('M-')) {
							milestoneNodeId = impl.nodeId;
						} else {
							const implMeta = nodeMeta.get(impl.nodeId);
							if (implMeta?.parent) {
								milestoneNodeId = entityIdToNodeId.get(implMeta.parent);
							}
						}

						// Get the milestone's bounding box from tracker
						if (milestoneNodeId) {
							const milestoneBox = tracker.get(milestoneNodeId);
							if (milestoneBox) {
								// The milestone position + relative bounding box
								const milestonePos = finalPositions.get(milestoneNodeId);
								if (milestonePos) {
									// Calculate actual min/max Y from all children positions
									for (const [, relPos] of milestoneBox.relativePositions) {
										const absoluteY = milestonePos.y + relPos.y;
										actualMinY = Math.min(actualMinY, absoluteY);
										actualMaxY = Math.max(actualMaxY, absoluteY + config.nodeHeight);
									}
									// Also include the milestone itself
									actualMinY = Math.min(actualMinY, milestonePos.y);
									actualMaxY = Math.max(actualMaxY, milestonePos.y + config.nodeHeight);
								}
							}
						}

						// Fallback: use implementer position directly
						if (actualMinY === Infinity) {
							actualMinY = Math.min(actualMinY, impl.y);
							actualMaxY = Math.max(actualMaxY, impl.y + config.nodeHeight);
						}
					}

					// Fallback if no bounding boxes found
					if (actualMinY === Infinity) {
						actualMinY = Math.min(...implementerPositions.map(p => p.y));
						actualMaxY = Math.max(...implementerPositions.map(p => p.y)) + config.nodeHeight;
					}

					// Determine stacking direction for multi-implementer docs
					let stackDirection: number;
					if (actualMaxY - actualMinY > 2 * config.nodeHeight) {
						// Different workstreams - position between them, stack downward
						docY = (actualMinY + actualMaxY) / 2 - config.nodeHeight / 2;
						stackDirection = 1;
					} else {
						// Same workstream - position ABOVE the topmost child with offset
						docY = actualMinY - config.nodeHeight - 2 * config.documentVerticalSpacing;
						stackDirection = -1;
					}

					// Check if this position is already used by another document
					const posKey = `${Math.round(docX)},${Math.round(docY)}`;
					const existingCount = usedDocPositions.get(posKey) || 0;
					if (existingCount > 0) {
						// Offset this document in the stacking direction (use smaller spacing for doc-to-doc)
						docY += stackDirection * existingCount * (config.nodeHeight + config.verticalSpacing);
					}
					usedDocPositions.set(posKey, existingCount + 1);

					// Track for edge side handling (only for multi-implementer docs)
					multiMilestoneDocuments.set(doc.id, {
						leftmost: leftmost.nodeId,
						rightmost: rightmost.nodeId,
					});

					console.log(`  Multi-implementer document ${meta.entityId} positioned between ${leftmost.entityId} and ${rightmost.entityId} (actualMinY=${actualMinY}, actualMaxY=${actualMaxY}, docY=${docY}, offset=${existingCount})`);
				}

				finalPositions.set(doc.id, {
					x: docX,
					y: docY,
					width: config.nodeWidth,
					height: config.nodeHeight,
				});
			}

			// ============================================================
			// STEP 8.6: Position multi-milestone features
			// Features spanning multiple milestones are positioned ABOVE/BELOW
			// the spanning containers (similar to multi-milestone documents)
			// Single-parent features are already positioned in Step 4
			// ============================================================
			const usedFeaturePositions = new Map<string, number>();

			// Find all features that haven't been positioned yet (multi-milestone or orphan)
			const unpositionedFeatures = fileNodes.filter(n => {
				const meta = nodeMeta.get(n.id);
				return meta?.type === 'feature' && !finalPositions.has(n.id);
			});

			for (const feature of unpositionedFeatures) {
				const meta = nodeMeta.get(feature.id);
				if (!meta?.implementedBy?.length) {
					// Feature without implementers - position at default location
					// Find a reasonable default position (left of all milestones)
					let minX = Infinity;
					let avgY = 0;
					let count = 0;
					for (const [, pos] of finalPositions) {
						minX = Math.min(minX, pos.x);
						avgY += pos.y;
						count++;
					}
					if (count > 0) {
						avgY /= count;
						finalPositions.set(feature.id, {
							x: minX - config.featureSpacing - config.nodeWidth,
							y: avgY,
							width: config.nodeWidth,
							height: config.nodeHeight,
						});
					}
					continue;
				}

				// Find all implementer positions and their milestone containers
				const implementerPositions: { entityId: string; nodeId: string; x: number; y: number; milestoneId?: string }[] = [];
				const implementerMilestones = new Set<string>();

				for (const implEntityId of meta.implementedBy) {
					const implNodeId = entityIdToNodeId.get(implEntityId);
					if (!implNodeId) continue;

					const implPos = finalPositions.get(implNodeId);
					if (!implPos) continue;

					// Find the milestone this implementer belongs to
					let milestoneId: string | undefined;
					if (implEntityId.startsWith('M-')) {
						milestoneId = implEntityId;
					} else {
						const implMeta = nodeMeta.get(implNodeId);
						milestoneId = implMeta?.parent;
					}
					if (milestoneId) implementerMilestones.add(milestoneId);

					implementerPositions.push({
						entityId: implEntityId,
						nodeId: implNodeId,
						x: implPos.x,
						y: implPos.y,
						milestoneId,
					});
				}

				if (implementerPositions.length === 0) continue;

				// Sort by X position to find leftmost and rightmost
				implementerPositions.sort((a, b) => a.x - b.x);
				const leftmost = implementerPositions[0];
				const rightmost = implementerPositions[implementerPositions.length - 1];

				let featureX: number;
				let featureY: number;

				// MULTI-MILESTONE FEATURE: Position ABOVE or BELOW the spanning containers
				// Centered horizontally between leftmost and rightmost implementers
				featureX = (leftmost.x + rightmost.x + config.nodeWidth) / 2 - config.nodeWidth / 2;

				// Get bounding boxes of all involved milestone containers
				let containerMinY = Infinity;
				let containerMaxY = -Infinity;

				for (const milestoneEntityId of implementerMilestones) {
					const milestoneNodeId = entityIdToNodeId.get(milestoneEntityId);
					if (!milestoneNodeId) continue;

					const box = tracker.get(milestoneNodeId);
					const mPos = finalPositions.get(milestoneNodeId);
					if (!box || !mPos) continue;

					// Calculate actual bounds of this milestone container
					for (const [childNodeId] of box.relativePositions) {
						const childPos = finalPositions.get(childNodeId);
						if (childPos) {
							containerMinY = Math.min(containerMinY, childPos.y);
							containerMaxY = Math.max(containerMaxY, childPos.y + childPos.height);
						}
					}
					containerMinY = Math.min(containerMinY, mPos.y);
					containerMaxY = Math.max(containerMaxY, mPos.y + mPos.height);
				}

				// Position above or below based on available space
				// Default to above (negative Y direction)
				const featureAbove = true; // Could be made smarter based on context
				if (featureAbove) {
					featureY = containerMinY - config.featureVerticalSpacing - config.nodeHeight;
				} else {
					featureY = containerMaxY + config.featureVerticalSpacing;
				}

				// Check if this position is already used
				const posKey = `${Math.round(featureX)},${Math.round(featureY)}`;
				const existingCount = usedFeaturePositions.get(posKey) || 0;
				if (existingCount > 0) {
					// Stack further above/below
					const stackDir = featureAbove ? -1 : 1;
					featureY += stackDir * existingCount * (config.nodeHeight + config.verticalSpacing);
				}
				usedFeaturePositions.set(posKey, existingCount + 1);

				console.log(`  Multi-milestone feature ${meta.entityId} positioned ${featureAbove ? 'ABOVE' : 'BELOW'} ${implementerMilestones.size} milestone containers`);

				finalPositions.set(feature.id, {
					x: featureX,
					y: featureY,
					width: config.nodeWidth,
					height: config.nodeHeight,
				});
			}

			// ============================================================
			// STEP 9: Position decisions that affect documents or features
			// Decisions are positioned to the LEFT of the document/feature they affect
			// For multi-milestone features: position ABOVE the feature
			// Stacking direction follows the target's Y position relative to implementers:
			// - Target above implementers → stack decisions upward
			// - Target below implementers → stack decisions downward
			// - Target between implementers → stack decisions downward
			// ============================================================
			// Track target (doc/feature) stacking direction for decisions
			const targetStackDirection = new Map<string, number>(); // targetNodeId -> direction (-1=up, 1=down)
			// Track which features span multiple milestones (for special positioning)
			const multiMilestoneFeatures = new Set<string>(); // nodeIds of multi-milestone features

			// Calculate stacking direction for each positioned document/feature
			for (const node of fileNodes) {
				const meta = nodeMeta.get(node.id);
				if (meta?.type !== 'document' && meta?.type !== 'feature') continue;

				const nodePos = finalPositions.get(node.id);
				if (!nodePos) continue;

				// Find implementer positions
				const implementerYs: number[] = [];
				const implementerMilestones = new Set<string>();
				for (const implEntityId of meta.implementedBy || []) {
					const implNodeId = entityIdToNodeId.get(implEntityId);
					if (implNodeId) {
						const implPos = finalPositions.get(implNodeId);
						if (implPos) implementerYs.push(implPos.y);

						// Track milestone for features
						if (meta.type === 'feature') {
							if (implEntityId.startsWith('M-')) {
								implementerMilestones.add(implEntityId);
							} else {
								const implMeta = nodeMeta.get(implNodeId);
								if (implMeta?.parent) implementerMilestones.add(implMeta.parent);
							}
						}
					}
				}

				// Mark multi-milestone features
				if (meta.type === 'feature' && implementerMilestones.size > 1) {
					multiMilestoneFeatures.add(node.id);
				}

				if (implementerYs.length === 0) {
					// No implementers found, default to downward
					targetStackDirection.set(node.id, 1);
					continue;
				}

				const minImplY = Math.min(...implementerYs);
				const maxImplY = Math.max(...implementerYs);

				// Determine stacking direction based on target position relative to implementers
				if (maxImplY - minImplY > config.nodeHeight) {
					// Target is between implementers (vertically) → stack downward
					targetStackDirection.set(node.id, 1);
				} else if (nodePos.y < minImplY) {
					// Target is above implementers → stack upward
					targetStackDirection.set(node.id, -1);
				} else {
					// Target is below or at same level as implementers → stack downward
					targetStackDirection.set(node.id, 1);
				}
			}

			// Find all unpositioned decisions that affect documents or features
			// Consider both 'enables' (legacy) and 'affects' (new) fields
			const unpositionedDecisions = fileNodes.filter(n => {
				const meta = nodeMeta.get(n.id);
				return meta?.type === 'decision' && !finalPositions.has(n.id) &&
					(meta.enables.length > 0 || meta.affects.length > 0);
			});

			console.log(`Step 9: Found ${unpositionedDecisions.length} unpositioned decisions with enables/affects`);
			for (const dec of unpositionedDecisions) {
				const meta = nodeMeta.get(dec.id);
				console.log(`  Decision ${meta?.entityId}: enables=[${meta?.enables.join(',')}], affects=[${meta?.affects.join(',')}]`);
			}

			// Group decisions by the document/feature they affect
			const decisionsByTarget = new Map<string, string[]>(); // targetNodeId -> [decisionNodeIds]
			for (const dec of unpositionedDecisions) {
				const meta = nodeMeta.get(dec.id);
				if (!meta) continue;

				// Combine enables and affects, deduplicate
				const affectedIds = [...new Set([...meta.enables, ...meta.affects])];
				console.log(`  Decision ${meta.entityId} affectedIds: [${affectedIds.join(',')}]`);

				for (const affectedEntityId of affectedIds) {
					const affectedNodeId = entityIdToNodeId.get(affectedEntityId);
					if (!affectedNodeId) {
						console.log(`    ${affectedEntityId}: NOT FOUND in entityIdToNodeId`);
						continue;
					}

					const affectedMeta = nodeMeta.get(affectedNodeId);
					// Only handle documents and features here
					if (affectedMeta?.type !== 'document' && affectedMeta?.type !== 'feature') {
						console.log(`    ${affectedEntityId}: type=${affectedMeta?.type} (skipping, not doc/feature)`);
						continue;
					}

					// Check if the target is positioned
					if (!finalPositions.has(affectedNodeId)) continue;

					const existing = decisionsByTarget.get(affectedNodeId) || [];
					if (!existing.includes(dec.id)) {
						existing.push(dec.id);
						decisionsByTarget.set(affectedNodeId, existing);
					}
				}
			}

			// Position decisions relative to their affected documents/features
			for (const [targetNodeId, decisionNodeIds] of decisionsByTarget) {
				const targetPos = finalPositions.get(targetNodeId);
				if (!targetPos) continue;

				const targetMeta = nodeMeta.get(targetNodeId);
				const isMultiMilestoneFeature = multiMilestoneFeatures.has(targetNodeId);

				let decX: number;
				let decY: number;
				let stackDir: number;

				if (isMultiMilestoneFeature) {
					// Multi-milestone feature: position decisions ABOVE the feature
					// Similar to how multi-milestone documents are positioned
					decX = targetPos.x; // Same X as feature
					decY = targetPos.y - config.nodeHeight - config.verticalSpacing; // Above feature
					stackDir = -1; // Stack upward
					console.log(`  Positioning decisions ABOVE multi-milestone feature`);
				} else {
					// Single-milestone feature or document: position LEFT of target
					stackDir = targetStackDirection.get(targetNodeId) || 1;
					decX = targetPos.x - (config.documentSpacing * 0.6) - config.nodeWidth;
					decY = targetPos.y; // Start at same Y as target
				}

				for (const decNodeId of decisionNodeIds) {
					finalPositions.set(decNodeId, {
						x: decX,
						y: decY,
						width: config.nodeWidth,
						height: config.nodeHeight,
					});

					const decMeta = nodeMeta.get(decNodeId);
					const targetType = targetMeta?.type || 'unknown';
					if (isMultiMilestoneFeature) {
						console.log(`  Decision ${decMeta?.entityId} positioned ABOVE multi-milestone feature ${targetMeta?.entityId}`);
					} else {
						console.log(`  Decision ${decMeta?.entityId} positioned LEFT of ${targetType} ${targetMeta?.entityId} (stackDir=${stackDir})`);
					}

					// Stack next decision in the appropriate direction
					decY += stackDir * (config.nodeHeight + config.verticalSpacing);
				}
			}

			// ============================================================
			// STEP 9.5: Position orphan decisions that have blocks/enables/affects relationships
			// These decisions don't have a parent but block/enable/affect other entities
			// Position them to the LEFT of the entities they relate to
			// ============================================================
			const orphanDecisions = fileNodes.filter(n => {
				const meta = nodeMeta.get(n.id);
				return meta?.type === 'decision' && !finalPositions.has(n.id) &&
					(meta.blocks?.length > 0 || meta.enables?.length > 0 || meta.affects?.length > 0);
			});

			for (const decision of orphanDecisions) {
				const meta = nodeMeta.get(decision.id);
				if (!meta) continue;

				// Find positions of entities this decision blocks, enables, or affects
				const relatedPositions: { x: number; y: number }[] = [];

				for (const blockedEntityId of meta.blocks || []) {
					const blockedNodeId = entityIdToNodeId.get(blockedEntityId);
					if (blockedNodeId) {
						const blockedPos = finalPositions.get(blockedNodeId);
						if (blockedPos) relatedPositions.push({ x: blockedPos.x, y: blockedPos.y });
					}
				}

				for (const enabledEntityId of meta.enables || []) {
					const enabledNodeId = entityIdToNodeId.get(enabledEntityId);
					if (enabledNodeId) {
						const enabledPos = finalPositions.get(enabledNodeId);
						if (enabledPos) relatedPositions.push({ x: enabledPos.x, y: enabledPos.y });
					}
				}

				for (const affectedEntityId of meta.affects || []) {
					const affectedNodeId = entityIdToNodeId.get(affectedEntityId);
					if (affectedNodeId) {
						const affectedPos = finalPositions.get(affectedNodeId);
						if (affectedPos) relatedPositions.push({ x: affectedPos.x, y: affectedPos.y });
					}
				}

				if (relatedPositions.length === 0) continue;

				// Position to the LEFT of the leftmost related entity
				const leftmostX = Math.min(...relatedPositions.map(p => p.x));
				const avgY = relatedPositions.reduce((sum, p) => sum + p.y, 0) / relatedPositions.length;

				finalPositions.set(decision.id, {
					x: leftmostX - config.decisionSpacing - config.nodeWidth,
					y: avgY,
					width: config.nodeWidth,
					height: config.nodeHeight,
				});

				console.log(`  Orphan decision ${meta.entityId} positioned LEFT of ${relatedPositions.length} related entities`);
			}

			// ============================================================
			// STEP 9.6: Position orphan tasks/stories with blocks/depends_on relationships
			// These form dependency chains that should be positioned together
			// Blockers go LEFT, blocked entities go RIGHT
			// ============================================================
			const orphanTasksWithBlockRels = fileNodes.filter(n => {
				const meta = nodeMeta.get(n.id);
				if (!meta || finalPositions.has(n.id)) return false;
				if (meta.type !== 'task' && meta.type !== 'story') return false;
				// Has blocks or depends_on relationships
				return (meta.blocks?.length > 0) || (meta.dependsOn?.length > 0);
			});

			if (orphanTasksWithBlockRels.length > 0) {
				console.log(`Found ${orphanTasksWithBlockRels.length} orphan tasks/stories with block relationships`);

				// Build a set of all orphan task entity IDs for filtering
				const orphanTaskEntityIds = new Set<string>();
				for (const node of orphanTasksWithBlockRels) {
					const meta = nodeMeta.get(node.id);
					if (meta?.entityId) orphanTaskEntityIds.add(meta.entityId);
				}

				// Build dependency graph among these orphan tasks
				// blockedBy: entityId -> [entityIds that block it]
				const blockedBy = new Map<string, string[]>();
				for (const node of orphanTasksWithBlockRels) {
					const meta = nodeMeta.get(node.id);
					if (!meta?.entityId) continue;

					// From depends_on field
					for (const depId of meta.dependsOn || []) {
						if (orphanTaskEntityIds.has(depId)) {
							if (!blockedBy.has(meta.entityId)) blockedBy.set(meta.entityId, []);
							if (!blockedBy.get(meta.entityId)!.includes(depId)) {
								blockedBy.get(meta.entityId)!.push(depId);
							}
						}
					}

					// From blocks field (reverse direction)
					for (const blockedId of meta.blocks || []) {
						if (orphanTaskEntityIds.has(blockedId)) {
							if (!blockedBy.has(blockedId)) blockedBy.set(blockedId, []);
							if (!blockedBy.get(blockedId)!.includes(meta.entityId)) {
								blockedBy.get(blockedId)!.push(meta.entityId);
							}
						}
					}
				}

				// Topological sort to get positioning order (blockers first)
				const sorted: string[] = [];
				const visited = new Set<string>();
				const visiting = new Set<string>();

				const visit = (entityId: string) => {
					if (visited.has(entityId)) return;
					if (visiting.has(entityId)) return; // Cycle detected
					visiting.add(entityId);

					// Visit all blockers first
					for (const blockerId of blockedBy.get(entityId) || []) {
						visit(blockerId);
					}

					visiting.delete(entityId);
					visited.add(entityId);
					sorted.push(entityId);
				};

				for (const entityId of orphanTaskEntityIds) {
					visit(entityId);
				}

				console.log(`  Topological order: ${sorted.join(' -> ')}`);

				// Position in order: each entity goes to the RIGHT of its blockers
				// Start position for orphan task chains
				let chainStartX = config.startX;
				let chainStartY = currentLaneY + config.streamSpacing;

				// Track positions by entity ID
				const taskPositions = new Map<string, { x: number; y: number }>();

				for (const entityId of sorted) {
					const nodeId = entityIdToNodeId.get(entityId);
					if (!nodeId) continue;

					const blockers = blockedBy.get(entityId) || [];
					let x: number;
					let y: number;

					if (blockers.length === 0) {
						// No blockers - this is a root of a chain
						x = chainStartX;
						y = chainStartY;
						// Move start position down for next chain root
						chainStartY += config.nodeHeight + config.verticalSpacing;
					} else {
						// Position to the RIGHT of the rightmost blocker
						const blockerPositions = blockers
							.map(bid => taskPositions.get(bid))
							.filter((p): p is { x: number; y: number } => p !== undefined);

						if (blockerPositions.length > 0) {
							const rightmostX = Math.max(...blockerPositions.map(p => p.x));
							const avgY = blockerPositions.reduce((sum, p) => sum + p.y, 0) / blockerPositions.length;
							x = rightmostX + config.nodeWidth + config.storySpacing;
							y = avgY;
						} else {
							// Fallback if blockers not positioned yet
							x = chainStartX;
							y = chainStartY;
							chainStartY += config.nodeHeight + config.verticalSpacing;
						}
					}

					taskPositions.set(entityId, { x, y });
					finalPositions.set(nodeId, {
						x,
						y,
						width: config.nodeWidth,
						height: config.nodeHeight,
					});

					const meta = nodeMeta.get(nodeId);
					console.log(`  Orphan task ${entityId} positioned at (${x}, ${y}) - blockers: ${blockers.join(', ') || 'none'}`);
				}
			}

			// ============================================================
			// STEP 10: Handle orphan nodes and nodes not assigned to milestones
			// ============================================================
			const orphans = fileNodes.filter(n => !finalPositions.has(n.id));
			if (orphans.length > 0) {
				console.log(`Positioning ${orphans.length} orphan nodes`);
				for (const orphan of orphans) {
					const meta = nodeMeta.get(orphan.id);
					console.log(`  Orphan: ${meta?.entityId} (type=${meta?.type}, affects=[${meta?.affects?.join(',')}])`);
				}

				// Position orphans in the orphan area
				let orphanX = config.startX;
				let orphanY = currentLaneY + config.streamSpacing;

				for (const orphan of orphans) {
					finalPositions.set(orphan.id, {
						x: orphanX,
						y: orphanY,
						width: config.nodeWidth,
						height: config.nodeHeight,
					});
					orphanY += config.nodeHeight + config.verticalSpacing;

					// Wrap to next column if too many
					if (orphanY > currentLaneY + 2000) {
						orphanY = currentLaneY + config.streamSpacing;
						orphanX += config.nodeWidth + config.storySpacing;
					}
				}
			}

			// ============================================================
			// STEP 10.5: AFTER PASS - Resolve overlaps within and between milestone containers
			// 1. First, resolve overlaps within each milestone container
			// 2. Then, ensure milestone containers don't overlap (push later ones right)
			// ============================================================
			const MIN_CONTAINER_SPACING = 500; // Minimum gap between milestone containers
			const MIN_ENTITY_SPACING = 50;     // Minimum gap between entities within a container

			// Helper: Check if two rectangles overlap
			const rectsOverlap = (
				r1: { x: number; y: number; width: number; height: number },
				r2: { x: number; y: number; width: number; height: number },
				padding: number = 0
			): boolean => {
				return !(
					r1.x + r1.width + padding <= r2.x ||
					r2.x + r2.width + padding <= r1.x ||
					r1.y + r1.height + padding <= r2.y ||
					r2.y + r2.height + padding <= r1.y
				);
			};

			// Helper: Calculate bounding box for a milestone container (milestone + ALL descendants)
			// Uses nodeToMilestone map to include children of children (e.g., tasks under stories)
			// Excludes multi-milestone documents
			const getMilestoneContainerBounds = (milestoneNodeId: string): { minX: number; maxX: number; minY: number; maxY: number } | null => {
				const mPos = finalPositions.get(milestoneNodeId);
				if (!mPos) return null;

				let minX = mPos.x;
				let maxX = mPos.x + mPos.width;
				let minY = mPos.y;
				let maxY = mPos.y + mPos.height;

				// Include ALL entities assigned to this milestone (including children of children)
				for (const [nodeId, assignedMilestoneId] of nodeToMilestone) {
					if (assignedMilestoneId !== milestoneNodeId) continue;

					// Skip multi-milestone documents
					if (multiMilestoneDocuments.has(nodeId)) continue;

					const childPos = finalPositions.get(nodeId);
					if (childPos) {
						minX = Math.min(minX, childPos.x);
						maxX = Math.max(maxX, childPos.x + childPos.width);
						minY = Math.min(minY, childPos.y);
						maxY = Math.max(maxY, childPos.y + childPos.height);
					}
				}

				return { minX, maxX, minY, maxY };
			};

			// PART 1: Resolve overlaps within each milestone container
			console.log('\n=== AFTER PASS: Resolving overlaps ===');

			for (const milestone of milestones) {
				const mId = milestone.id;
				const box = tracker.get(mId);
				if (!box) continue;

				const mMeta = nodeMeta.get(mId);
				const mEntityId = mMeta?.entityId || mId;

				// Get all entities in this container (excluding multi-milestone docs)
				const containerEntities: string[] = [mId];
				for (const [childNodeId] of box.relativePositions) {
					if (!multiMilestoneDocuments.has(childNodeId)) {
						containerEntities.push(childNodeId);
					}
				}

				// Check for overlaps and resolve them
				let overlapResolved = false;
				let iterations = 0;
				const maxIterations = 50; // Prevent infinite loops

				while (iterations < maxIterations) {
					iterations++;
					let foundOverlap = false;

					for (let i = 0; i < containerEntities.length; i++) {
						const nodeA = containerEntities[i];
						const posA = finalPositions.get(nodeA);
						if (!posA) continue;

						for (let j = i + 1; j < containerEntities.length; j++) {
							const nodeB = containerEntities[j];
							const posB = finalPositions.get(nodeB);
							if (!posB) continue;

							if (rectsOverlap(posA, posB, MIN_ENTITY_SPACING)) {
								foundOverlap = true;

								// Determine which node to move based on type priority
								// Milestone stays fixed, then stories, then tasks, then others
								const metaA = nodeMeta.get(nodeA);
								const metaB = nodeMeta.get(nodeB);
								const priorityOrder = ['milestone', 'story', 'task', 'decision', 'document', 'feature'];
								const priorityA = priorityOrder.indexOf(metaA?.type || 'feature');
								const priorityB = priorityOrder.indexOf(metaB?.type || 'feature');

								// Move the lower priority node (higher index), or if same priority, move the second one
								const nodeToMove = priorityB >= priorityA ? nodeB : nodeA;
								const posToMove = nodeToMove === nodeB ? posB : posA;
								const otherPos = nodeToMove === nodeB ? posA : posB;

								// Calculate overlap amount and push apart vertically
								const overlapY = Math.min(
									otherPos.y + otherPos.height + MIN_ENTITY_SPACING - posToMove.y,
									posToMove.y + posToMove.height + MIN_ENTITY_SPACING - otherPos.y
								);

								// Push in the direction the node is already offset
								const pushDirection = posToMove.y >= otherPos.y ? 1 : -1;
								posToMove.y += pushDirection * (overlapY / 2 + MIN_ENTITY_SPACING);

								if (!overlapResolved) {
									const metaToMove = nodeMeta.get(nodeToMove);
									console.log(`  Container ${mEntityId}: Resolved overlap between ${metaA?.entityId || nodeA} and ${metaB?.entityId || nodeB}, moved ${metaToMove?.entityId || nodeToMove}`);
									overlapResolved = true;
								}
							}
						}
					}

					if (!foundOverlap) break;
				}

				if (iterations >= maxIterations) {
					console.warn(`  Container ${mEntityId}: Max iterations reached while resolving overlaps`);
				}
			}

			// PART 2: Ensure milestone containers don't overlap (push later ones right)
			// Process milestones in order (left to right) within each workstream
			for (const [workstream, wsMilestones] of milestonesByWorkstream) {
				// Sort milestones by their current X position (left to right)
				const sortedByX = [...wsMilestones].sort((a, b) => {
					const posA = finalPositions.get(a.id);
					const posB = finalPositions.get(b.id);
					return (posA?.x || 0) - (posB?.x || 0);
				});

				for (let i = 1; i < sortedByX.length; i++) {
					const currentMilestone = sortedByX[i];
					const currentBounds = getMilestoneContainerBounds(currentMilestone.id);
					if (!currentBounds) continue;

					// Check against all previous milestones
					for (let j = 0; j < i; j++) {
						const prevMilestone = sortedByX[j];
						const prevBounds = getMilestoneContainerBounds(prevMilestone.id);
						if (!prevBounds) continue;

						// Check if containers overlap horizontally (with minimum spacing)
						const currentLeft = currentBounds.minX;
						const prevRight = prevBounds.maxX;

						if (currentLeft < prevRight + MIN_CONTAINER_SPACING) {
							// Calculate shift needed
							const shift = prevRight + MIN_CONTAINER_SPACING - currentLeft;

							const currentMeta = nodeMeta.get(currentMilestone.id);
							const prevMeta = nodeMeta.get(prevMilestone.id);
							console.log(`  Workstream ${workstream}: Shifting ${currentMeta?.entityId || currentMilestone.id} right by ${Math.round(shift)}px (overlaps with ${prevMeta?.entityId || prevMilestone.id})`);

							// Shift current milestone and all its children
							const currentPos = finalPositions.get(currentMilestone.id);
							if (currentPos) currentPos.x += shift;

							const currentBox = tracker.get(currentMilestone.id);
							if (currentBox) {
								for (const [childNodeId] of currentBox.relativePositions) {
									const childPos = finalPositions.get(childNodeId);
									if (childPos) childPos.x += shift;
								}
							}

							// Also shift any features linked to this milestone
							for (const feature of unpositionedFeatures) {
								const featureMeta = nodeMeta.get(feature.id);
								if (!featureMeta?.implementedBy) continue;

								// Check if this feature is linked to the current milestone
								const linkedToCurrentMilestone = featureMeta.implementedBy.some(implId => {
									if (implId === currentMeta?.entityId) return true;
									// Check if implementer's parent is this milestone
									const implNodeId = entityIdToNodeId.get(implId);
									if (implNodeId) {
										const implMeta = nodeMeta.get(implNodeId);
										return implMeta?.parent === currentMeta?.entityId;
									}
									return false;
								});

								if (linkedToCurrentMilestone) {
									const featurePos = finalPositions.get(feature.id);
									if (featurePos) featurePos.x += shift;
								}
							}
						}
					}
				}
			}

			// PART 3: Ensure workstreams don't overlap vertically
			// Calculate actual Y bounds for each workstream and push down if needed
			const workstreamOrder = Array.from(milestonesByWorkstream.keys());

			// Helper: Get all entities in a workstream (all milestones + their children)
			const getWorkstreamBounds = (workstream: string): { minY: number; maxY: number } | null => {
				const wsMilestones = milestonesByWorkstream.get(workstream);
				if (!wsMilestones || wsMilestones.length === 0) return null;

				let minY = Infinity;
				let maxY = -Infinity;

				for (const milestone of wsMilestones) {
					// Include milestone itself
					const mPos = finalPositions.get(milestone.id);
					if (mPos) {
						minY = Math.min(minY, mPos.y);
						maxY = Math.max(maxY, mPos.y + mPos.height);
					}

					// Include all children
					const box = tracker.get(milestone.id);
					if (box) {
						for (const [childNodeId] of box.relativePositions) {
							const childPos = finalPositions.get(childNodeId);
							if (childPos) {
								minY = Math.min(minY, childPos.y);
								maxY = Math.max(maxY, childPos.y + childPos.height);
							}
						}
					}
				}

				return minY === Infinity ? null : { minY, maxY };
			};

			// Helper: Shift all entities in a workstream by deltaY
			const shiftWorkstreamVertically = (workstream: string, deltaY: number) => {
				const wsMilestones = milestonesByWorkstream.get(workstream);
				if (!wsMilestones) return;

				for (const milestone of wsMilestones) {
					// Shift milestone
					const mPos = finalPositions.get(milestone.id);
					if (mPos) mPos.y += deltaY;

					// Shift all children
					const box = tracker.get(milestone.id);
					if (box) {
						for (const [childNodeId] of box.relativePositions) {
							const childPos = finalPositions.get(childNodeId);
							if (childPos) childPos.y += deltaY;
						}
					}

					// Shift features linked to this milestone
					const mMeta = nodeMeta.get(milestone.id);
					for (const feature of unpositionedFeatures) {
						const featureMeta = nodeMeta.get(feature.id);
						if (!featureMeta?.implementedBy) continue;

						const linkedToMilestone = featureMeta.implementedBy.some(implId => {
							if (implId === mMeta?.entityId) return true;
							const implNodeId = entityIdToNodeId.get(implId);
							if (implNodeId) {
								const implMeta = nodeMeta.get(implNodeId);
								return implMeta?.parent === mMeta?.entityId;
							}
							return false;
						});

						if (linkedToMilestone) {
							const featurePos = finalPositions.get(feature.id);
							if (featurePos) featurePos.y += deltaY;
						}
					}
				}
			};

			// Process workstreams in order (top to bottom)
			for (let i = 1; i < workstreamOrder.length; i++) {
				const currentWorkstream = workstreamOrder[i];
				const currentBounds = getWorkstreamBounds(currentWorkstream);
				if (!currentBounds) continue;

				// Check against all previous workstreams
				for (let j = 0; j < i; j++) {
					const prevWorkstream = workstreamOrder[j];
					const prevBounds = getWorkstreamBounds(prevWorkstream);
					if (!prevBounds) continue;

					// Check if workstreams overlap vertically (with minimum spacing)
					if (currentBounds.minY < prevBounds.maxY + MIN_CONTAINER_SPACING) {
						const shift = prevBounds.maxY + MIN_CONTAINER_SPACING - currentBounds.minY;
						console.log(`  Workstream ${currentWorkstream}: Shifting down by ${Math.round(shift)}px (overlaps with ${prevWorkstream})`);

						shiftWorkstreamVertically(currentWorkstream, shift);

						// Update bounds for subsequent checks
						currentBounds.minY += shift;
						currentBounds.maxY += shift;
					}
				}
			}

			console.log('=== AFTER PASS complete ===\n');

			// ============================================================
			// STEP 11: Apply positions to nodes
			// ============================================================
			let repositionedCount = 0;
			for (const node of fileNodes) {
				const pos = finalPositions.get(node.id);
				if (pos) {
					node.x = pos.x;
					node.y = pos.y;
					node.width = pos.width;
					node.height = pos.height;
					repositionedCount++;
				}
			}

			// ============================================================
			// STEP 12: Update edge sides for cleaner connections
			// ============================================================
			for (const edge of canvasData.edges) {
				const fromPos = finalPositions.get(edge.fromNode);
				const toPos = finalPositions.get(edge.toNode);

				if (fromPos && toPos) {
					// Special handling for multi-milestone documents
					// DOC's LEFT side connects to entities on its LEFT
					// DOC's RIGHT side connects to entities on its RIGHT
					const fromMultiDoc = multiMilestoneDocuments.get(edge.fromNode);
					const toMultiDoc = multiMilestoneDocuments.get(edge.toNode);

					if (fromMultiDoc) {
						// Edge FROM a multi-milestone document TO an implementer
						if (edge.toNode === fromMultiDoc.leftmost || toPos.x < fromPos.x) {
							// Target is on the left - use document's LEFT side
							edge.fromSide = 'left';
							edge.toSide = 'right';
						} else if (edge.toNode === fromMultiDoc.rightmost || toPos.x > fromPos.x) {
							// Target is on the right - use document's RIGHT side
							edge.fromSide = 'right';
							edge.toSide = 'left';
						} else {
							// Fallback to position-based
							edge.fromSide = fromPos.x < toPos.x ? 'right' : 'left';
							edge.toSide = fromPos.x < toPos.x ? 'left' : 'right';
						}
					} else if (toMultiDoc) {
						// Edge TO a multi-milestone document FROM an implementer
						if (edge.fromNode === toMultiDoc.leftmost || fromPos.x < toPos.x) {
							// Source is on the left - connect to document's LEFT side
							edge.fromSide = 'right';
							edge.toSide = 'left';
						} else if (edge.fromNode === toMultiDoc.rightmost || fromPos.x > toPos.x) {
							// Source is on the right - connect to document's RIGHT side
							edge.fromSide = 'left';
							edge.toSide = 'right';
						} else {
							// Fallback to position-based
							edge.fromSide = fromPos.x < toPos.x ? 'right' : 'left';
							edge.toSide = fromPos.x < toPos.x ? 'left' : 'right';
						}
					} else {
						// Standard edge side logic based on relative positions
						if (fromPos.x < toPos.x) {
							edge.fromSide = 'right';
							edge.toSide = 'left';
						} else if (fromPos.x > toPos.x) {
							edge.fromSide = 'left';
							edge.toSide = 'right';
						} else if (fromPos.y < toPos.y) {
							edge.fromSide = 'bottom';
							edge.toSide = 'top';
						} else {
							edge.fromSide = 'top';
							edge.toSide = 'bottom';
						}
					}
				}
			}

			// Remove existing group nodes
			canvasData.nodes = canvasData.nodes.filter(n => n.type !== 'group');

			console.log('Repositioned', repositionedCount, 'nodes');

			// ============================================================
			// STEP 11: Save and reopen canvas
			// ============================================================
			this.isUpdatingCanvas = true;
			const closedLeaves = await closeCanvasViews(this.app, canvasFile);
			console.log('Closed', closedLeaves.length, 'canvas views');

			await new Promise(resolve => setTimeout(resolve, 100));
			await saveCanvasData(this.app, canvasFile, canvasData);
			console.log('Saved canvas with new positions');

			await new Promise(resolve => setTimeout(resolve, 200));
			await this.app.workspace.openLinkText(canvasFile.path, '', false);

			this.isUpdatingCanvas = false;
			console.groupEnd();

			new Notice(`✅ Repositioned ${repositionedCount} nodes`);

		} catch (error) {
			console.error('ERROR in repositionCanvasNodes:', error);
			console.groupEnd();
			this.isUpdatingCanvas = false;
			new Notice("❌ Failed to reposition nodes: " + (error as Error).message);
		}
	}

	/**
	 * Reposition canvas nodes using V3 algorithm:
	 * - Hierarchical container model with children LEFT and ABOVE parent
	 * - Workstream-based lanes with milestones ordered by dependencies
	 * - Grid-based child layout minimizing diagonal
	 * - Multi-parent entity handling (same workstream vs cross-workstream)
	 * - Orphan positioning in grid below workstreams
	 */
	private async repositionCanvasNodesV3(): Promise<void> {
		console.group('[Canvas Plugin] repositionCanvasNodesV3');

		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			console.warn('No active canvas file found');
			console.groupEnd();
			new Notice("Please open a canvas file first");
			return;
		}

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			console.log('Canvas has', canvasData.nodes.length, 'nodes,', canvasData.edges.length, 'edges');

			const fileNodes = canvasData.nodes.filter(n => n.type === 'file');
			if (fileNodes.length === 0) {
				new Notice("No file nodes on canvas to reposition");
				console.groupEnd();
				return;
			}

			// ============================================================
			// STEP 1: Parse node metadata from frontmatter
			// ============================================================
			const entities: EntityData[] = [];

			// Get canvas folder for resolving relative paths
			const canvasFolderV3 = canvasFile.parent?.path || '';

			// Helper to strip quotes from a value
			const stripQuotesLayout = (value: string): string => {
				const trimmed = value.trim();
				if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
					(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
					return trimmed.slice(1, -1);
				}
				return trimmed;
			};

			// Helper to parse YAML array - use [ \t]* instead of \s* to avoid matching newlines
			const parseYamlArray = (text: string, key: string): string[] => {
				const multilineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'));
				if (multilineMatch) {
					const items = multilineMatch[1].match(/^[ \t]*-[ \t]*(.+)$/gm);
					if (items) {
						return items.map(item => stripQuotesLayout(item.replace(/^[ \t]*-[ \t]*/, '')));
					}
				}
				const inlineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\[([^\\]]+)\\]`, 'm'));
				if (inlineMatch) {
					return inlineMatch[1].split(',').map(s => stripQuotesLayout(s));
				}
				const singleMatch = text.match(new RegExp(`^${key}:[ \\t]*([^\\n\\[]+)$`, 'm'));
				if (singleMatch && singleMatch[1].trim()) {
					return [stripQuotesLayout(singleMatch[1])];
				}
				return [];
			};

			for (const node of fileNodes) {
				if (!node.file) continue;
				// Try direct path first, then try with canvas folder prefix
				let file = this.app.vault.getAbstractFileByPath(node.file);
				if (!(file instanceof TFile) && canvasFolderV3) {
					file = this.app.vault.getAbstractFileByPath(`${canvasFolderV3}/${node.file}`);
				}
				if (!(file instanceof TFile)) continue;

				try {
					const content = await this.app.vault.read(file);
					const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (!fmMatch) continue;

					const fmText = fmMatch[1];
					// Use [ \t]* instead of \s* to avoid matching newlines
					const typeMatch = fmText.match(/^type:[ \t]*(.+)$/m);
					const workstreamMatch = fmText.match(/^workstream:[ \t]*(.+)$/m);
					const idMatch = fmText.match(/^id:[ \t]*(.+)$/m);
					const parentMatch = fmText.match(/^parent:[ \t]*(.+)$/m);
					const enables = parseYamlArray(fmText, 'enables');
					const blocksArr = parseYamlArray(fmText, 'blocks');
					const dependsOnArr = parseYamlArray(fmText, 'depends_on');
					const implementedByArr = parseYamlArray(fmText, 'implemented_by');
					const implementsArr = parseYamlArray(fmText, 'implements');

					const entityId = idMatch?.[1]?.trim();
					const typeStr = typeMatch?.[1]?.trim().toLowerCase() || 'unknown';

					// Map type string to PositioningEntityType
					const validTypes: PositioningEntityType[] = ['milestone', 'story', 'task', 'decision', 'document', 'feature'];
					const entityType: PositioningEntityType = validTypes.includes(typeStr as PositioningEntityType)
						? typeStr as PositioningEntityType
						: 'task'; // Default unknown types to task

					if (entityId) {
						entities.push({
							entityId,
							nodeId: node.id,
							type: entityType,
							workstream: workstreamMatch?.[1]?.trim().toLowerCase() || 'unassigned',
							parent: parentMatch?.[1]?.trim(),
							dependsOn: dependsOnArr,
							blocks: blocksArr,
							enables,
							implementedBy: implementedByArr,
							implements: implementsArr,
							filePath: node.file || '',
						});
					}
				} catch (e) {
					console.warn('Failed to read frontmatter for node:', node.id, e);
				}
			}

			console.log(`Parsed ${entities.length} entities from canvas nodes`);

			// ============================================================
			// STEP 2: Run V3 positioning engine
			// ============================================================
			const engine = new PositioningEngineV3();
			const result = engine.calculatePositions(entities);

			// Log errors and warnings
			if (result.errors.length > 0) {
				console.error('Positioning errors:', result.errors);
				for (const error of result.errors) {
					new Notice(`⚠️ ${error}`);
				}
			}
			if (result.warnings.length > 0) {
				console.warn('Positioning warnings:', result.warnings);
			}

			// ============================================================
			// STEP 3: Apply positions to canvas nodes
			// ============================================================
			let repositionedCount = 0;
			for (const node of canvasData.nodes) {
				const position = result.positions.get(node.id);
				if (position) {
					node.x = Math.round(position.x);
					node.y = Math.round(position.y);
					node.width = Math.round(position.width);
					node.height = Math.round(position.height);
					repositionedCount++;
				}
			}

			console.log(`Applied positions to ${repositionedCount} nodes`);

			// ============================================================
			// STEP 4: Update edge sides based on new positions
			// ============================================================
			for (const edge of canvasData.edges) {
				const fromNode = canvasData.nodes.find(n => n.id === edge.fromNode);
				const toNode = canvasData.nodes.find(n => n.id === edge.toNode);

				if (fromNode && toNode) {
					// Determine edge sides based on relative positions
					if (fromNode.x + fromNode.width < toNode.x) {
						// From is left of To
						edge.fromSide = 'right';
						edge.toSide = 'left';
					} else if (toNode.x + toNode.width < fromNode.x) {
						// To is left of From
						edge.fromSide = 'left';
						edge.toSide = 'right';
					} else if (fromNode.y + fromNode.height < toNode.y) {
						// From is above To
						edge.fromSide = 'bottom';
						edge.toSide = 'top';
					} else {
						// From is below To
						edge.fromSide = 'top';
						edge.toSide = 'bottom';
					}
				}
			}

			// Remove existing group nodes
			canvasData.nodes = canvasData.nodes.filter(n => n.type !== 'group');

			// ============================================================
			// STEP 5: Save and reopen canvas
			// ============================================================
			this.isUpdatingCanvas = true;
			const closedLeaves = await closeCanvasViews(this.app, canvasFile);
			console.log('Closed', closedLeaves.length, 'canvas views');

			await new Promise(resolve => setTimeout(resolve, 100));
			await saveCanvasData(this.app, canvasFile, canvasData);
			console.log('Saved canvas with new positions');

			await new Promise(resolve => setTimeout(resolve, 200));
			await this.app.workspace.openLinkText(canvasFile.path, '', false);

			this.isUpdatingCanvas = false;
			console.groupEnd();

			new Notice(`✅ Repositioned ${repositionedCount} nodes (V3 algorithm)`);

		} catch (error) {
			console.error('ERROR in repositionCanvasNodesV3:', error);
			console.groupEnd();
			this.isUpdatingCanvas = false;
			new Notice("❌ Failed to reposition nodes: " + (error as Error).message);
		}
	}

	/**
	 * Reposition canvas nodes using V4 algorithm:
	 * - Ruleset-based relationship processing
	 * - Entity categories: Contained, Floating, Orphan
	 * - Priority-based containment conflict resolution
	 * - Cross-workstream positioning for Milestones and Stories
	 * - Auto-migration of Decision enables/blocks to affects
	 */
	private async repositionCanvasNodesV4(): Promise<void> {
		console.group('[Canvas Plugin] repositionCanvasNodesV4');

		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			console.warn('No active canvas file found');
			console.groupEnd();
			new Notice("Please open a canvas file first");
			return;
		}

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			console.log('Canvas has', canvasData.nodes.length, 'nodes,', canvasData.edges.length, 'edges');

			const fileNodes = canvasData.nodes.filter(n => n.type === 'file');
			if (fileNodes.length === 0) {
				new Notice("No file nodes on canvas to reposition");
				console.groupEnd();
				return;
			}

			// ============================================================
			// STEP 1: Parse node metadata using canonical entity parser
			// ============================================================
			const entities: EntityDataV4[] = [];

			// Get canvas folder for resolving relative paths
			const canvasFolder = canvasFile.parent?.path || '';

			for (const node of fileNodes) {
				if (!node.file) continue;
				// Try direct path first, then try with canvas folder prefix
				let file = this.app.vault.getAbstractFileByPath(node.file);
				if (!(file instanceof TFile) && canvasFolder) {
					file = this.app.vault.getAbstractFileByPath(`${canvasFolder}/${node.file}`);
				}
				if (!(file instanceof TFile)) continue;

				try {
					const content = await this.app.vault.read(file);
					const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (!fmMatch) continue;

					const entityData = parseEntityFromFrontmatter(fmMatch[1], node.id, node.file);
					if (entityData) {
						entities.push(entityData);
					}
				} catch (e) {
					console.warn('Failed to read frontmatter for node:', node.id, e);
				}
			}

			console.log(`Parsed ${entities.length} entities from canvas nodes`);

			// ============================================================
			// STEP 2: Run V4 positioning engine
			// ============================================================
			const engine = new PositioningEngineV4();
			const result = engine.calculatePositions(entities);

			// Log errors and warnings
			if (result.errors.length > 0) {
				console.error('Positioning errors:', result.errors);
				for (const error of result.errors) {
					new Notice(`⚠️ ${error}`);
				}
			}
			if (result.warnings.length > 0) {
				console.warn('Positioning warnings:', result.warnings);
			}

			// ============================================================
			// STEP 3: Apply positions to canvas nodes
			// ============================================================
			let repositionedCount = 0;
			for (const node of canvasData.nodes) {
				const position = result.positions.get(node.id);
				if (position) {
					node.x = Math.round(position.x);
					node.y = Math.round(position.y);
					node.width = Math.round(position.width);
					node.height = Math.round(position.height);
					repositionedCount++;
				}
			}

			console.log(`Applied positions to ${repositionedCount} nodes`);

			// ============================================================
			// STEP 4: Update edge sides based on new positions
			// ============================================================
			for (const edge of canvasData.edges) {
				const fromPos = result.positions.get(edge.fromNode);
				const toPos = result.positions.get(edge.toNode);

				if (fromPos && toPos) {
					// Determine edge sides based on relative positions
					// Prioritize the axis with the larger difference
					const dx = Math.abs(fromPos.x - toPos.x);
					const dy = Math.abs(fromPos.y - toPos.y);

					if (dx > dy) {
						// Horizontal relationship dominates
						if (fromPos.x < toPos.x) {
							// From is left of To: right → left
							edge.fromSide = 'right';
							edge.toSide = 'left';
						} else {
							// From is right of To: left → right
							edge.fromSide = 'left';
							edge.toSide = 'right';
						}
					} else {
						// Vertical relationship dominates
						if (fromPos.y < toPos.y) {
							// From is above To: bottom → top
							edge.fromSide = 'bottom';
							edge.toSide = 'top';
						} else {
							// From is below To: top → bottom
							edge.fromSide = 'top';
							edge.toSide = 'bottom';
						}
					}
				}
			}

			console.log(`Updated edge sides for ${canvasData.edges.length} edges`);

			// ============================================================
			// STEP 5: Save canvas
			// ============================================================
			this.isUpdatingCanvas = true;
			await closeCanvasViews(this.app, canvasFile);
			await new Promise(resolve => setTimeout(resolve, 100));
			await saveCanvasData(this.app, canvasFile, canvasData);
			console.log('Saved canvas with new positions');

			await new Promise(resolve => setTimeout(resolve, 200));
			await this.app.workspace.openLinkText(canvasFile.path, '', false);

			this.isUpdatingCanvas = false;
			console.groupEnd();

			new Notice(`✅ Repositioned ${repositionedCount} nodes (V4 algorithm)`);

		} catch (error) {
			console.error('ERROR in repositionCanvasNodesV4:', error);
			console.groupEnd();
			this.isUpdatingCanvas = false;
			new Notice("❌ Failed to reposition nodes: " + (error as Error).message);
		}
	}

	/**
	 * Focus on entities that are currently "In Progress" or equivalent active status.
	 * Selects all in-progress nodes and zooms the canvas to fit them.
	 *
	 * Limited to milestones, stories, and tasks only.
	 * Active statuses:
	 * - Milestone/Story: "In Progress"
	 * - Task: "InProgress"
	 */
	private async focusOnInProgressEntities(): Promise<void> {
		console.group('[Canvas Plugin] focusOnInProgressEntities');

		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			console.warn('No active canvas file found');
			console.groupEnd();
			new Notice("Please open a canvas file first");
			return;
		}

		try {
			// Get the canvas view
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!activeLeaf || activeLeaf.view?.getViewType() !== "canvas") {
				new Notice("Please open a canvas file first");
				console.groupEnd();
				return;
			}

			// @ts-ignore - canvas view internals
			const canvas = activeLeaf.view?.canvas;
			if (!canvas) {
				new Notice("Could not access canvas");
				console.groupEnd();
				return;
			}

			// Active status values (normalized to lowercase with underscores)
			const activeStatuses = new Set([
				"in_progress",    // Milestone, Story
				"inprogress",     // Task (normalized)
			]);

			// Entity types to include (milestones, stories, tasks only)
			const includedTypes = new Set([
				"milestone",
				"story",
				"task",
			]);

			// Find all nodes with active status
			const inProgressNodes: unknown[] = [];

			// @ts-ignore - canvas.nodes is a Map<string, CanvasNode>
			const canvasNodes = canvas.nodes as Map<string, unknown> | undefined;
			if (!canvasNodes) {
				new Notice("No nodes found on canvas");
				console.groupEnd();
				return;
			}

			for (const [nodeId, canvasNode] of canvasNodes) {
				// @ts-ignore - get node's DOM element
				const nodeEl = (canvasNode as { nodeEl?: HTMLElement }).nodeEl;
				if (!nodeEl) continue;

				// Check entity type - only include milestones, stories, tasks
				const entityType = nodeEl.getAttribute("data-canvas-pm-type");
				if (!entityType || !includedTypes.has(entityType)) continue;

				// Check the data-canvas-pm-status attribute
				const status = nodeEl.getAttribute("data-canvas-pm-status");
				if (status && activeStatuses.has(status)) {
					inProgressNodes.push(canvasNode);
					console.debug('[Canvas Plugin] Found in-progress node:', nodeId, 'type:', entityType, 'status:', status);
				}
			}

			if (inProgressNodes.length === 0) {
				new Notice("No in-progress entities found");
				console.groupEnd();
				return;
			}

			console.log('[Canvas Plugin] Found', inProgressNodes.length, 'in-progress nodes');

			// Clear current selection and select in-progress nodes
			// @ts-ignore - canvas.deselectAll
			if (typeof canvas.deselectAll === 'function') {
				canvas.deselectAll();
			}

			// Select all in-progress nodes
			// @ts-ignore - canvas.select or canvas.addToSelection
			if (canvas.selection && typeof canvas.selection.clear === 'function') {
				canvas.selection.clear();
			}

			for (const node of inProgressNodes) {
				// @ts-ignore - canvas.select or node.select
				if (typeof canvas.addToSelection === 'function') {
					canvas.addToSelection(node);
				} else if (canvas.selection && typeof canvas.selection.add === 'function') {
					canvas.selection.add(node);
				}
			}

			// Calculate bounding box of all in-progress nodes
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

			for (const node of inProgressNodes) {
				// @ts-ignore - get node position and size
				const x = (node as any).x ?? 0;
				const y = (node as any).y ?? 0;
				const width = (node as any).width ?? 350;
				const height = (node as any).height ?? 350;

				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x + width);
				maxY = Math.max(maxY, y + height);
			}

			// Add padding around the bounding box
			const padding = 100;
			minX -= padding;
			minY -= padding;
			maxX += padding;
			maxY += padding;

			console.log('[Canvas Plugin] Bounding box:', { minX, minY, maxX, maxY });

			// Zoom to the bounding box
			// @ts-ignore - canvas.zoomToBbox
			if (typeof canvas.zoomToBbox === 'function') {
				canvas.zoomToBbox({ minX, minY, maxX, maxY });
				console.log('[Canvas Plugin] Zoomed to bbox using zoomToBbox');
			}
			// @ts-ignore - alternative: canvas.zoomToSelection
			else if (typeof canvas.zoomToSelection === 'function') {
				canvas.zoomToSelection();
				console.log('[Canvas Plugin] Zoomed using zoomToSelection');
			}
			// @ts-ignore - alternative: canvas.setViewport
			else if (typeof canvas.setViewport === 'function') {
				const centerX = (minX + maxX) / 2;
				const centerY = (minY + maxY) / 2;
				const width = maxX - minX;
				const height = maxY - minY;
				// Calculate zoom to fit
				const viewWidth = canvas.wrapperEl?.clientWidth ?? 1000;
				const viewHeight = canvas.wrapperEl?.clientHeight ?? 800;
				const zoom = Math.min(viewWidth / width, viewHeight / height) * 0.9;
				canvas.setViewport(centerX, centerY, zoom);
				console.log('[Canvas Plugin] Set viewport manually');
			}
			else {
				console.warn('[Canvas Plugin] No zoom method found on canvas');
				// At least we selected the nodes
			}

			new Notice(`✅ Focused on ${inProgressNodes.length} in-progress entities`);
			console.groupEnd();

		} catch (error) {
			console.error('ERROR in focusOnInProgressEntities:', error);
			console.groupEnd();
			new Notice("❌ Failed to focus on in-progress entities: " + (error as Error).message);
		}
	}

	/**
	 * Remove duplicate nodes from canvas.
	 * Duplicates are identified by entity ID (from frontmatter).
	 * When duplicates are found, keeps the node that has edges connected to it.
	 * If multiple duplicates have edges (or none have edges), keeps the first one found.
	 */
	private async removeDuplicateNodes(): Promise<void> {
		console.group('[Canvas Plugin] removeDuplicateNodes');

		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			console.warn('No active canvas file found');
			console.groupEnd();
			new Notice("Please open a canvas file first");
			return;
		}

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			console.log('Canvas has', canvasData.nodes.length, 'nodes,', canvasData.edges.length, 'edges');

			const fileNodes = canvasData.nodes.filter(n => n.type === 'file');
			if (fileNodes.length === 0) {
				new Notice("No file nodes on canvas");
				console.groupEnd();
				return;
			}

			// Build a set of node IDs that have edges connected
			const nodesWithEdges = new Set<string>();
			for (const edge of canvasData.edges) {
				nodesWithEdges.add(edge.fromNode);
				nodesWithEdges.add(edge.toNode);
			}
			console.log('Nodes with edges:', nodesWithEdges.size);

			// Read entity IDs from frontmatter for all file nodes
			const nodeEntityIds = new Map<string, string>(); // nodeId -> entityId
			const nodeFilePaths = new Map<string, string>(); // nodeId -> filePath

			for (const node of fileNodes) {
				if (!node.file) continue;
				nodeFilePaths.set(node.id, node.file);

				const file = this.app.vault.getAbstractFileByPath(node.file);
				if (!(file instanceof TFile)) continue;

				try {
					const content = await this.app.vault.read(file);
					const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
					if (fmMatch) {
						const idMatch = fmMatch[1].match(/^id:\s*(.+)$/m);
						if (idMatch) {
							nodeEntityIds.set(node.id, idMatch[1].trim());
						}
					}
				} catch (e) {
					console.warn('Failed to read frontmatter for node:', node.id, e);
				}
			}

			// Group nodes by entity ID
			const nodesByEntityId = new Map<string, string[]>(); // entityId -> [nodeIds]
			for (const [nodeId, entityId] of nodeEntityIds) {
				if (!nodesByEntityId.has(entityId)) {
					nodesByEntityId.set(entityId, []);
				}
				nodesByEntityId.get(entityId)!.push(nodeId);
			}

			// Find duplicates and decide which to remove
			const nodesToRemove = new Set<string>();
			let duplicateGroups = 0;

			for (const [entityId, nodeIds] of nodesByEntityId) {
				if (nodeIds.length <= 1) continue; // No duplicates

				duplicateGroups++;
				console.log(`Found ${nodeIds.length} duplicates for entity ${entityId}`);

				// Separate nodes with edges from those without
				const withEdges = nodeIds.filter(id => nodesWithEdges.has(id));
				const withoutEdges = nodeIds.filter(id => !nodesWithEdges.has(id));

				console.log(`  - With edges: ${withEdges.length}, Without edges: ${withoutEdges.length}`);

				// Strategy: Keep one node (preferably one with edges), remove the rest
				let nodeToKeep: string;

				if (withEdges.length > 0) {
					// Keep the first node with edges
					nodeToKeep = withEdges[0];
					// Remove all others (both with and without edges)
					for (const nodeId of nodeIds) {
						if (nodeId !== nodeToKeep) {
							nodesToRemove.add(nodeId);
							console.log(`  - Removing node ${nodeId} (${nodeFilePaths.get(nodeId)})`);
						}
					}
				} else {
					// No nodes have edges, keep the first one
					nodeToKeep = nodeIds[0];
					for (let i = 1; i < nodeIds.length; i++) {
						nodesToRemove.add(nodeIds[i]);
						console.log(`  - Removing node ${nodeIds[i]} (${nodeFilePaths.get(nodeIds[i])})`);
					}
				}

				console.log(`  - Keeping node ${nodeToKeep} (${nodeFilePaths.get(nodeToKeep)})`);
			}

			if (nodesToRemove.size === 0) {
				console.log('No duplicate nodes found');
				console.groupEnd();
				new Notice("No duplicate nodes found on canvas");
				return;
			}

			console.log(`Removing ${nodesToRemove.size} duplicate nodes from ${duplicateGroups} duplicate groups`);

			// Remove duplicate nodes
			canvasData.nodes = canvasData.nodes.filter(n => !nodesToRemove.has(n.id));

			// Also remove any edges that reference removed nodes
			const edgesBefore = canvasData.edges.length;
			canvasData.edges = canvasData.edges.filter(e =>
				!nodesToRemove.has(e.fromNode) && !nodesToRemove.has(e.toNode)
			);
			const edgesRemoved = edgesBefore - canvasData.edges.length;
			if (edgesRemoved > 0) {
				console.log(`Also removed ${edgesRemoved} orphaned edges`);
			}

			// Save canvas
			this.isUpdatingCanvas = true;
			const closedLeaves = await closeCanvasViews(this.app, canvasFile);
			console.log('Closed', closedLeaves.length, 'canvas views');

			await new Promise(resolve => setTimeout(resolve, 100));
			await saveCanvasData(this.app, canvasFile, canvasData);
			console.log('Saved canvas');

			await new Promise(resolve => setTimeout(resolve, 200));
			await this.app.workspace.openLinkText(canvasFile.path, '', false);

			this.isUpdatingCanvas = false;
			console.groupEnd();

			new Notice(`✅ Removed ${nodesToRemove.size} duplicate nodes`);

		} catch (error) {
			console.error('ERROR in removeDuplicateNodes:', error);
			console.groupEnd();
			this.isUpdatingCanvas = false;
			new Notice("❌ Failed to remove duplicates: " + (error as Error).message);
		}
	}

	/**
	 * Migrate decision fields in vault markdown files.
	 * - Moves 'enables' values to 'affects'
	 * - Moves 'blocks' values that point to non-decisions to 'affects'
	 * - Removes the 'enables' field after migration
	 */
	async migrateDecisionFieldsInVault(): Promise<void> {
		console.group('[Canvas Plugin] Migrate decision fields');

		const decisionsFolder = this.settings.entityNavigator.decisionsFolder;
		if (!decisionsFolder) {
			new Notice("No decisions folder configured in settings");
			console.groupEnd();
			return;
		}

		// Get all markdown files in decisions folder (search recursively)
		const allFiles = this.app.vault.getMarkdownFiles();
		const decisionFiles = allFiles.filter(f => f.path.includes('/' + decisionsFolder + '/') || f.path.startsWith(decisionsFolder + '/'));

		console.log(`Found ${decisionFiles.length} files in decisions folder`);

		let migratedCount = 0;
		let skippedCount = 0;
		const migrations: { file: string; changes: string[] }[] = [];

		for (const file of decisionFiles) {
			try {
				const content = await this.app.vault.read(file);
				const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
				if (!frontmatterMatch) {
					skippedCount++;
					continue;
				}

				const frontmatterText = frontmatterMatch[1];

				// Check if this is a decision
				const typeMatch = frontmatterText.match(/^type:[ \t]*(.+)$/m);
				if (!typeMatch || typeMatch[1].trim().toLowerCase() !== 'decision') {
					skippedCount++;
					continue;
				}

				// Parse enables array
				const enablesMatch = frontmatterText.match(/^enables:[ \t]*(.*)$/m);
				let enables: string[] = [];
				if (enablesMatch && enablesMatch[1].trim()) {
					const enablesValue = enablesMatch[1].trim();
					if (enablesValue.startsWith('[') && enablesValue.endsWith(']')) {
						try {
							enables = JSON.parse(enablesValue);
						} catch {
							// Try YAML-style array
							const inner = enablesValue.slice(1, -1).trim();
							if (inner) {
								enables = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s);
							}
						}
					}
				}

				// Parse blocks array
				const blocksMatch = frontmatterText.match(/^blocks:[ \t]*(.*)$/m);
				let blocks: string[] = [];
				if (blocksMatch && blocksMatch[1].trim()) {
					const blocksValue = blocksMatch[1].trim();
					if (blocksValue.startsWith('[') && blocksValue.endsWith(']')) {
						try {
							blocks = JSON.parse(blocksValue);
						} catch {
							const inner = blocksValue.slice(1, -1).trim();
							if (inner) {
								blocks = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s);
							}
						}
					}
				}

				// Parse existing affects array
				const affectsMatch = frontmatterText.match(/^affects:[ \t]*(.*)$/m);
				let affects: string[] = [];
				if (affectsMatch && affectsMatch[1].trim()) {
					const affectsValue = affectsMatch[1].trim();
					if (affectsValue.startsWith('[') && affectsValue.endsWith(']')) {
						try {
							affects = JSON.parse(affectsValue);
						} catch {
							const inner = affectsValue.slice(1, -1).trim();
							if (inner) {
								affects = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s);
							}
						}
					}
				}

				// Determine what needs to be migrated
				const changes: string[] = [];
				const toMigrateToAffects: string[] = [];

				// Migrate all enables to affects
				if (enables.length > 0) {
					toMigrateToAffects.push(...enables);
					changes.push(`enables [${enables.join(', ')}] → affects`);
				}

				// Migrate ALL blocks to affects (both decision and non-decision targets)
				if (blocks.length > 0) {
					toMigrateToAffects.push(...blocks);
					changes.push(`blocks [${blocks.join(', ')}] → affects`);
				}

				// Skip if nothing to migrate
				if (changes.length === 0) {
					skippedCount++;
					continue;
				}

				// Build new affects array (deduplicated)
				const newAffects = [...new Set([...affects, ...toMigrateToAffects])];

				// Build updated frontmatter
				let newFrontmatter = frontmatterText;

				// Update or add affects field
				if (affectsMatch) {
					newFrontmatter = newFrontmatter.replace(
						/^affects:[ \t]*.*$/m,
						`affects: ${JSON.stringify(newAffects)}`
					);
				} else {
					// Add affects after type line
					newFrontmatter = newFrontmatter.replace(
						/^(type:[ \t]*.+)$/m,
						`$1\naffects: ${JSON.stringify(newAffects)}`
					);
				}

				// Remove enables field entirely
				if (enablesMatch) {
					newFrontmatter = newFrontmatter.replace(/^enables:[ \t]*.*\n?/m, '');
				}

				// Remove blocks field entirely
				if (blocksMatch) {
					newFrontmatter = newFrontmatter.replace(/^blocks:[ \t]*.*\n?/m, '');
				}

				// Rebuild content
				const body = content.substring(frontmatterMatch[0].length);
				const newContent = `---\n${newFrontmatter.trim()}\n---${body}`;

				// Write updated content
				await this.app.vault.modify(file, newContent);

				migratedCount++;
				migrations.push({ file: file.path, changes });
				console.log(`Migrated ${file.path}:`, changes);

			} catch (error) {
				console.error(`Error processing ${file.path}:`, error);
			}
		}

		console.log(`Migration complete: ${migratedCount} files migrated, ${skippedCount} skipped`);
		if (migrations.length > 0) {
			console.table(migrations);
		}
		console.groupEnd();

		if (migratedCount > 0) {
			new Notice(`✅ Migrated ${migratedCount} decision files (enables → affects)`);
		} else {
			new Notice("No decision files needed migration");
		}
	}

	/**
	 * Strip IDs from filenames and update canvas references.
	 * Transforms: T-014_[C1.5]_Implement_WorkflowLogger.md -> Implement_WorkflowLogger.md
	 * Pattern: Removes prefix like "X-NNN_" or "X-NNN_[...anything...]_" from the beginning
	 */
	async stripIdsFromFilenames(): Promise<void> {
		console.group('[Canvas Plugin] Strip IDs from filenames');

		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			new Notice("No active canvas file");
			console.groupEnd();
			return;
		}

		this.isUpdatingCanvas = true;

		try {
			const canvasData = await loadCanvasData(this.app, canvasFile);
			const fileNodes = canvasData.nodes.filter(n => n.type === 'file' && n.file?.endsWith('.md'));

			if (fileNodes.length === 0) {
				new Notice("No Markdown file nodes found on canvas");
				console.groupEnd();
				this.isUpdatingCanvas = false;
				return;
			}

			console.log(`Found ${fileNodes.length} file nodes to process`);

			// Pattern to match:
			// - Start of string
			// - Letter(s)-Number(s) (e.g., T-014, M-001, S-123)
			// - Optionally followed by _[anything]_ (e.g., _[C1.5]_)
			// - Then the actual name
			const idPattern = /^[A-Z]+-\d+(?:_\[[^\]]*\])?_(.+)$/;

			let renamedCount = 0;
			const renamedFiles: { oldPath: string; newPath: string }[] = [];

			for (const node of fileNodes) {
				if (!node.file) continue;

				const filePath = node.file;
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) {
					console.log(`Skipping ${filePath} - file not found`);
					continue;
				}

				const fileName = file.basename; // Without extension
				const match = fileName.match(idPattern);

				if (match) {
					const newBaseName = match[1];
					const newPath = file.parent
						? `${file.parent.path}/${newBaseName}.md`
						: `${newBaseName}.md`;

					// Check if target already exists
					if (this.app.vault.getAbstractFileByPath(newPath)) {
						console.log(`Skipping ${fileName} - target ${newBaseName}.md already exists`);
						continue;
					}

					console.log(`Renaming: ${fileName}.md -> ${newBaseName}.md`);

					// Rename the file (Obsidian will update links automatically)
					await this.app.fileManager.renameFile(file, newPath);
					renamedFiles.push({ oldPath: filePath, newPath });
					renamedCount++;
				} else {
					console.log(`Skipping ${fileName} - doesn't match ID pattern`);
				}
			}

			// Update canvas node references
			if (renamedFiles.length > 0) {
				// Reload canvas data to get fresh state
				const updatedCanvasData = await loadCanvasData(this.app, canvasFile);

				for (const { oldPath, newPath } of renamedFiles) {
					const node = updatedCanvasData.nodes.find(n => n.file === oldPath);
					if (node) {
						node.file = newPath;
						console.log(`Updated canvas reference: ${oldPath} -> ${newPath}`);
					}
				}

				// Save updated canvas
				await this.app.vault.modify(canvasFile, JSON.stringify(updatedCanvasData, null, 2));
				console.log('Canvas file saved with updated references');
			}

			this.isUpdatingCanvas = false;
			console.groupEnd();

			new Notice(`✅ Renamed ${renamedCount} files`);

		} catch (error) {
			console.error('ERROR in stripIdsFromFilenames:', error);
			console.groupEnd();
			this.isUpdatingCanvas = false;
			new Notice("❌ Failed to strip IDs: " + (error as Error).message);
		}
	}

	// =========================================================================
	// Entity Navigator Methods
	// =========================================================================

	/** Initialize the Entity Navigator index */
	private async initializeEntityNavigator(): Promise<void> {
		// Check for Dataview plugin
		if (this.settings.entityNavigator.showDataviewWarning) {
			const dataviewPlugin = (this.app as any).plugins?.getPlugin?.('dataview');
			if (!dataviewPlugin) {
				new Notice("⚠️ Dataview plugin not found. Some Entity Navigator features may be limited.", 5000);
			}
		}

		// Build entity index
		this.entityIndex = new EntityIndex(this.app, this.settings.entityNavigator);
		await this.entityIndex.buildIndex();

		// Watch for file changes to update index
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.entityIndex?.updateFile(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.entityIndex?.removeFile(file);
				}
			})
		);

		console.log("[Entity Navigator] Initialized");
	}

	/** Get current entity from active file or selected canvas node */
	private getCurrentEntity(): EntityIndexEntry | null {
		const file = this.app.workspace.getActiveFile();

		// If active file is a markdown file, use it directly
		if (file && file.extension === "md") {
			return this.entityIndex?.getFromFile(file) || null;
		}

		// If active file is a canvas, try to get selected node's file
		if (file && file.extension === "canvas") {
			const selectedFile = this.getSelectedCanvasNodeFile();
			if (selectedFile) {
				return this.entityIndex?.getFromFile(selectedFile) || null;
			}
		}

		return null;
	}

	/** Get the file from the currently selected canvas node (if any) */
	private getSelectedCanvasNodeFile(): TFile | null {
		const view = this.app.workspace.getActiveViewOfType(require("obsidian").ItemView);
		if (!view || view.getViewType() !== "canvas") return null;

		const canvas = (view as any).canvas;
		if (!canvas?.selection) return null;

		// Get first selected node
		const selectedNodes = Array.from(canvas.selection);
		if (selectedNodes.length === 0) return null;

		const node = selectedNodes[0] as any;
		const data = node?.getData?.();
		if (!data?.file) return null;

		// Resolve file path to TFile
		const tfile = this.app.vault.getAbstractFileByPath(data.file);
		if (tfile instanceof TFile) return tfile;

		return null;
	}

	/** Open multiple files based on settings */
	private async openEntities(entries: EntityIndexEntry[]): Promise<void> {
		if (entries.length === 0) {
			new Notice("No related entities found");
			return;
		}

		const behavior = this.settings.entityNavigator.openBehavior;

		if (entries.length === 1 || behavior === 'tabs') {
			// Open all in new tabs
			for (const entry of entries) {
				await this.app.workspace.getLeaf('tab').openFile(entry.file);
			}
		} else if (behavior === 'split-h') {
			// Open first, then split horizontally for rest
			const firstLeaf = this.app.workspace.getLeaf('tab');
			await firstLeaf.openFile(entries[0].file);
			for (let i = 1; i < entries.length; i++) {
				const newLeaf = this.app.workspace.getLeaf('split', 'horizontal');
				await newLeaf.openFile(entries[i].file);
			}
		} else if (behavior === 'split-v') {
			// Open first, then split vertically for rest
			const firstLeaf = this.app.workspace.getLeaf('tab');
			await firstLeaf.openFile(entries[0].file);
			for (let i = 1; i < entries.length; i++) {
				const newLeaf = this.app.workspace.getLeaf('split', 'vertical');
				await newLeaf.openFile(entries[i].file);
			}
		}
	}

	/** Navigate to parent entity */
	private navigateToParent(): void {
		const entity = this.getCurrentEntity();
		if (!entity) {
			new Notice("No entity found in current file");
			return;
		}
		const parent = this.entityIndex?.getParent(entity.id);
		if (parent) {
			this.openEntities([parent]);
		} else {
			new Notice("No parent entity found");
		}
	}

	/** Navigate to children entities */
	private navigateToChildren(): void {
		const entity = this.getCurrentEntity();
		if (!entity) {
			new Notice("No entity found in current file");
			return;
		}
		const children = this.entityIndex?.getChildren(entity.id) || [];
		if (children.length > 0) {
			this.openEntities(children);
			new Notice(`Opening ${children.length} child entities`);
		} else {
			new Notice("No child entities found");
		}
	}

	/** Navigate to dependencies */
	private navigateToDependencies(): void {
		const entity = this.getCurrentEntity();
		console.log("[Entity Navigator] navigateToDependencies - entity:", entity);
		if (!entity) {
			new Notice("No entity found in current file");
			return;
		}
		console.log("[Entity Navigator] Entity depends_on:", entity.depends_on);
		const deps = this.entityIndex?.getDependencies(entity.id) || [];
		console.log("[Entity Navigator] Resolved dependencies:", deps);
		if (deps.length > 0) {
			this.openEntities(deps);
			new Notice(`Opening ${deps.length} dependencies`);
		} else {
			new Notice("No dependencies found");
		}
	}

	/** Navigate to implemented documents */
	private navigateToDocuments(): void {
		const entity = this.getCurrentEntity();
		if (!entity) {
			new Notice("No entity found in current file");
			return;
		}
		const docs = this.entityIndex?.getImplementedDocuments(entity.id) || [];
		if (docs.length > 0) {
			this.openEntities(docs);
			new Notice(`Opening ${docs.length} documents`);
		} else {
			new Notice("No implemented documents found");
		}
	}

	/** Navigate to related decisions */
	private navigateToDecisions(): void {
		const entity = this.getCurrentEntity();
		if (!entity) {
			new Notice("No entity found in current file");
			return;
		}
		const decisions = this.entityIndex?.getRelatedDecisions(entity.id) || [];
		if (decisions.length > 0) {
			this.openEntities(decisions);
			new Notice(`Opening ${decisions.length} decisions`);
		} else {
			new Notice("No related decisions found");
		}
	}

	/** Navigate to entities enabled by a decision */
	private navigateToEnabledEntities(): void {
		const entity = this.getCurrentEntity();
		if (!entity) {
			new Notice("No entity found in current file");
			return;
		}
		if (entity.type !== 'decision') {
			new Notice("This command only works on decision entities");
			return;
		}
		const enabled = this.entityIndex?.getEnabledEntities(entity.id) || [];
		if (enabled.length > 0) {
			this.openEntities(enabled);
			new Notice(`Opening ${enabled.length} enabled entities`);
		} else {
			new Notice("No enabled entities found");
		}
	}

	/** Navigate to features that the current entity implements */
	private navigateToFeatures(): void {
		const entity = this.getCurrentEntity();
		if (!entity) {
			new Notice("No entity found in current file");
			return;
		}
		const features = this.entityIndex?.getFeaturesImplementedBy(entity.id) || [];
		if (features.length > 0) {
			this.openEntities(features);
			new Notice(`Opening ${features.length} features`);
		} else {
			new Notice("No features found for this entity");
		}
	}

	// ==================== FEATURE ENTITY METHODS ====================

	/**
	 * Create a new feature entity
	 */
	private async createFeature(): Promise<void> {
		const modal = new FeatureModal(
			this.app,
			{
				modalTitle: "Create New Feature",
				submitButtonText: "Create Feature",
				workstreamOptions: this.settings.effortOptions,
			},
			async (result: FeatureModalResult) => {
				await this.createFeatureFile(result);
			}
		);
		modal.open();
	}

	/**
	 * Create the feature file from modal result
	 */
	private async createFeatureFile(result: FeatureModalResult): Promise<void> {
		const featuresFolder = this.settings.entityNavigator.featuresFolder;
		await this.ensureFolderExists(featuresFolder);

		// Generate feature ID
		const id = generateId(this.app, this.settings, "feature");
		const now = new Date().toISOString();

		// Create frontmatter
		const frontmatter: FeatureFrontmatter = {
			id,
			type: "feature",
			title: result.title,
			workstream: result.workstream,
			user_story: result.user_story,
			tier: result.tier,
			phase: result.phase,
			status: result.status,
			priority: result.priority,
			personas: result.personas,
			acceptance_criteria: result.acceptance_criteria,
			implemented_by: result.implemented_by || [],
			documented_by: [],
			decided_by: [],
			depends_on: [],
			blocks: [],
			last_updated: now,
			created_at: now,
			created_by_plugin: true,
		};

		// Generate file content
		const content = replaceFeaturePlaceholders(DEFAULT_FEATURE_TEMPLATE, frontmatter);

		// Create file
		const sanitizedTitle = result.title.replace(/[\\/:*?"<>|]/g, "-").substring(0, 50);
		const filename = `${id}_${sanitizedTitle}.md`;
		const filePath = normalizePath(`${featuresFolder}/${filename}`);

		await this.app.vault.create(filePath, content);
		new Notice(`Feature ${id} created: ${result.title}`);

		// Open the new file
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}

		// Rebuild entity index
		if (this.entityIndex) {
			await this.entityIndex.buildIndex();
		}
	}

	/**
	 * Set the phase of the current feature
	 */
	private async setFeaturePhase(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file");
			return;
		}

		const content = await this.app.vault.read(file);
		const fm = parseAnyFrontmatter(content);
		if (!fm || fm.type !== "feature") {
			new Notice("Current file is not a feature");
			return;
		}

		// Show phase selector
		const phases: FeaturePhase[] = ["MVP", "0", "1", "2", "3", "4", "5"];
		const currentPhase = (fm.phase as FeaturePhase) || "MVP";

		// Simple prompt for now - could be enhanced with a modal
		const newPhase = await this.showPhaseSelector(phases, currentPhase);
		if (newPhase && newPhase !== currentPhase) {
			const updatedContent = updateFrontmatter(content, { phase: newPhase, last_updated: new Date().toISOString() });
			await this.app.vault.modify(file, updatedContent);
			new Notice(`Feature phase updated to ${newPhase}`);
		}
	}

	/**
	 * Set the tier of the current feature
	 */
	private async setFeatureTier(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file");
			return;
		}

		const content = await this.app.vault.read(file);
		const fm = parseAnyFrontmatter(content);
		if (!fm || fm.type !== "feature") {
			new Notice("Current file is not a feature");
			return;
		}

		const currentTier = (fm.tier as FeatureTier) || "OSS";
		const newTier: FeatureTier = currentTier === "OSS" ? "Premium" : "OSS";

		const updatedContent = updateFrontmatter(content, { tier: newTier, last_updated: new Date().toISOString() });
		await this.app.vault.modify(file, updatedContent);
		new Notice(`Feature tier updated to ${newTier}`);
	}

	/**
	 * Show a simple phase selector (could be enhanced with a proper modal)
	 */
	private async showPhaseSelector(phases: FeaturePhase[], currentPhase: FeaturePhase): Promise<FeaturePhase | null> {
		return new Promise((resolve) => {
			const modal = new (class extends Modal {
				result: FeaturePhase | null = null;
				constructor(app: App) {
					super(app);
				}
				onOpen() {
					const { contentEl } = this;
					contentEl.createEl("h3", { text: "Select Feature Phase" });
					phases.forEach((phase) => {
						const btn = contentEl.createEl("button", {
							text: `Phase ${phase}${phase === currentPhase ? " (current)" : ""}`,
							cls: phase === currentPhase ? "mod-cta" : "",
						});
						btn.style.display = "block";
						btn.style.marginBottom = "8px";
						btn.style.width = "100%";
						btn.addEventListener("click", () => {
							this.result = phase;
							this.close();
						});
					});
				}
				onClose() {
					resolve(this.result);
				}
			})(this.app);
			modal.open();
		});
	}

	// ==================== FEATURE CANVAS ====================

	/**
	 * Create a new features.canvas file with predefined structure
	 */
	private async createFeaturesCanvas(): Promise<void> {
		const canvasPath = this.settings.entityNavigator.featuresFolder
			? `${this.settings.entityNavigator.featuresFolder}/features.canvas`
			: "features.canvas";

		// Check if canvas already exists
		const existingFile = this.app.vault.getAbstractFileByPath(canvasPath);
		if (existingFile) {
			new Notice(`Features canvas already exists at ${canvasPath}`);
			// Open the existing canvas
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(existingFile as TFile);
			return;
		}

		// Create the canvas structure
		const canvasData: CanvasData = {
			nodes: [
				// OSS Header
				{
					id: "header-oss",
					type: "text",
					text: "# OSS Features",
					x: 0,
					y: 0,
					width: 2000,
					height: 60,
				},
				// Premium Header
				{
					id: "header-premium",
					type: "text",
					text: "# Premium Features",
					x: 2200,
					y: 0,
					width: 1000,
					height: 60,
				},
				// Phase column headers for OSS
				{ id: "phase-mvp", type: "text", text: "## MVP", x: 0, y: 80, width: 300, height: 40 },
				{ id: "phase-0", type: "text", text: "## Phase 0", x: 350, y: 80, width: 300, height: 40 },
				{ id: "phase-1", type: "text", text: "## Phase 1", x: 700, y: 80, width: 300, height: 40 },
				{ id: "phase-2", type: "text", text: "## Phase 2", x: 1050, y: 80, width: 300, height: 40 },
				{ id: "phase-3", type: "text", text: "## Phase 3", x: 1400, y: 80, width: 300, height: 40 },
				{ id: "phase-4", type: "text", text: "## Phase 4", x: 1750, y: 80, width: 300, height: 40 },
				// Phase column headers for Premium
				{ id: "phase-premium-mvp", type: "text", text: "## MVP", x: 2200, y: 80, width: 300, height: 40 },
				{ id: "phase-premium-1", type: "text", text: "## Phase 1+", x: 2550, y: 80, width: 300, height: 40 },
			],
			edges: [],
		};

		// Ensure folder exists
		const folderPath = canvasPath.substring(0, canvasPath.lastIndexOf("/"));
		if (folderPath) {
			await this.ensureFolderExists(folderPath);
		}

		// Create the canvas file
		const content = JSON.stringify(canvasData, null, 2);
		const file = await this.app.vault.create(canvasPath, content);

		new Notice(`Features canvas created at ${canvasPath}`);

		// Open the new canvas
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}

	/**
	 * Auto-layout features on the features canvas by tier and phase
	 */
	private async autoLayoutFeaturesCanvas(): Promise<void> {
		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			new Notice("Please open a canvas file first");
			return;
		}

		// Load canvas data
		const canvasData = await loadCanvasData(this.app, canvasFile);

		// Get all feature nodes (file nodes with F- IDs)
		const featureNodes = canvasData.nodes.filter(node => {
			if (node.type !== "file" || !node.file) return false;
			const entityId = node.metadata?.entityId as string;
			return entityId?.startsWith("F-");
		});

		if (featureNodes.length === 0) {
			new Notice("No feature nodes found on canvas");
			return;
		}

		// Layout constants
		const nodeWidth = 300;
		const nodeHeight = 150;
		const horizontalGap = 50;
		const verticalGap = 30;
		const startY = 140; // Below headers

		// Phase columns (x positions)
		const phaseColumns: Record<string, number> = {
			"MVP": 0,
			"0": 350,
			"1": 700,
			"2": 1050,
			"3": 1400,
			"4": 1750,
			"5": 1750, // Same as 4 for now
		};

		const premiumOffset = 2200;

		// Group features by tier and phase, and collect dependency info
		const grouped: Record<string, Record<string, typeof featureNodes>> = {
			OSS: {},
			Premium: {},
		};

		// Map feature ID to node ID and dependencies
		const featureIdToNodeId = new Map<string, string>();
		const featureDependencies = new Map<string, string[]>(); // featureId -> depends_on IDs

		for (const node of featureNodes) {
			// Read frontmatter to get tier and phase
			const file = this.app.vault.getAbstractFileByPath(node.file!);
			if (!(file instanceof TFile)) continue;

			const content = await this.app.vault.read(file);
			const fm = parseAnyFrontmatter(content);
			if (!fm) continue;

			const featureId = (fm.id as string) || "";
			const tier = (fm.tier as string) || "OSS";
			const phase = String((fm.phase as string) || "MVP");
			const dependsOn = (fm.depends_on as string[]) || [];

			if (featureId) {
				featureIdToNodeId.set(featureId, node.id);
				featureDependencies.set(featureId, dependsOn);
			}

			if (!grouped[tier]) grouped[tier] = {};
			if (!grouped[tier][phase]) grouped[tier][phase] = [];
			grouped[tier][phase].push(node);
		}

		// Position nodes
		for (const tier of ["OSS", "Premium"]) {
			const tierOffset = tier === "Premium" ? premiumOffset : 0;

			for (const [phase, nodes] of Object.entries(grouped[tier] || {})) {
				const baseX = (phaseColumns[phase] ?? 0) + tierOffset;

				nodes.forEach((node, index) => {
					node.x = baseX;
					node.y = startY + index * (nodeHeight + verticalGap);
					node.width = nodeWidth;
					node.height = nodeHeight;
				});
			}
		}

		// Create dependency edges
		let edgesAdded = 0;
		for (const [featureId, dependsOnIds] of featureDependencies.entries()) {
			const toNodeId = featureIdToNodeId.get(featureId);
			if (!toNodeId) continue;

			for (const depId of dependsOnIds) {
				const fromNodeId = featureIdToNodeId.get(depId);
				if (!fromNodeId) continue;

				// Check if edge already exists
				if (!edgeExists(canvasData, fromNodeId, toNodeId)) {
					// Edge goes FROM dependency TO this node (A depends on B = B --> A)
					const edge = createEdge(fromNodeId, toNodeId, undefined, 'right', 'left');
					canvasData.edges.push(edge);
					edgesAdded++;
				}
			}
		}

		// Save canvas
		await saveCanvasData(this.app, canvasFile, canvasData);
		await reloadCanvasViews(this.app, canvasFile);

		new Notice(`Repositioned ${featureNodes.length} feature nodes, added ${edgesAdded} dependency edges`);
	}

	/**
	 * Populate features canvas from vault feature files
	 */
	private async populateFeaturesCanvas(): Promise<void> {
		const canvasFile = this.getActiveCanvasFile();
		if (!canvasFile) {
			new Notice("Please open a canvas file first");
			return;
		}

		// Load canvas data
		const canvasData = await loadCanvasData(this.app, canvasFile);

		// Get existing feature node file paths
		const existingPaths = new Set(
			canvasData.nodes
				.filter(n => n.type === "file" && n.file)
				.map(n => n.file!)
		);

		// Find all feature files in vault
		const featuresFolder = this.settings.entityNavigator.featuresFolder || "";
		const allFiles = this.app.vault.getMarkdownFiles();

		const featureFiles = allFiles.filter(file => {
			// Check if in features folder (if specified)
			if (featuresFolder && !file.path.startsWith(featuresFolder)) return false;

			// Check if filename starts with F-
			return file.basename.match(/^F-\d{3,}/);
		});

		// Add new feature nodes
		let addedCount = 0;
		const startY = 140;
		const nodeWidth = 300;
		const nodeHeight = 150;
		const verticalGap = 30;

		for (const file of featureFiles) {
			if (existingPaths.has(file.path)) continue;

			// Read frontmatter
			const content = await this.app.vault.read(file);
			const fm = parseAnyFrontmatter(content);

			const entityId = fm?.id || file.basename.match(/^(F-\d{3,})/)?.[1] || "";
			const tier = (fm?.tier as string) || "OSS";
			const phase = String((fm?.phase as string) || "MVP");

			// Calculate position based on tier and phase
			const phaseColumns: Record<string, number> = {
				"MVP": 0, "0": 350, "1": 700, "2": 1050, "3": 1400, "4": 1750, "5": 1750,
			};
			const premiumOffset = tier === "Premium" ? 2200 : 0;
			const baseX = (phaseColumns[phase] ?? 0) + premiumOffset;

			// Count existing nodes in this column to stack vertically
			const nodesInColumn = canvasData.nodes.filter(n =>
				n.type === "file" && Math.abs(n.x - baseX) < 50
			).length;

			const newNode: CanvasNode = {
				id: generateNodeId(),
				type: "file",
				file: file.path,
				x: baseX,
				y: startY + nodesInColumn * (nodeHeight + verticalGap),
				width: nodeWidth,
				height: nodeHeight,
				metadata: {
					plugin: "canvas-project-manager",
					shape: "feature",
					entityId,
				},
			};

			canvasData.nodes.push(newNode);
			addedCount++;
		}

		if (addedCount === 0) {
			new Notice("No new features to add");
			return;
		}

		// Save canvas
		await saveCanvasData(this.app, canvasFile, canvasData);
		await reloadCanvasViews(this.app, canvasFile);

		new Notice(`Added ${addedCount} feature nodes to canvas`);
	}

	/**
	 * Link the current entity (from active file) to a feature
	 */
	private async linkCurrentEntityToFeature(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "md") {
			new Notice("Please open a markdown file first");
			return;
		}

		// Read frontmatter
		const content = await this.app.vault.read(activeFile);
		const fm = parseAnyFrontmatter(content);
		if (!fm || !fm.id || !fm.type) {
			new Notice("This file does not have valid entity frontmatter");
			return;
		}

		const entityId = fm.id as string;
		const entityType = fm.type as EntityType;
		const entityTitle = (fm.title as string) || activeFile.basename;

		// Features can't link to themselves
		if (entityType === "feature") {
			new Notice("Features cannot be linked to other features using this command");
			return;
		}

		// Get all features from vault
		const featuresFolder = this.settings.entityNavigator.featuresFolder || "";
		const allFiles = this.app.vault.getMarkdownFiles();
		const availableFeatures: FeatureOption[] = [];

		for (const file of allFiles) {
			// Check if in features folder (if specified)
			if (featuresFolder && !file.path.startsWith(featuresFolder)) continue;

			// Check if filename starts with F-
			if (!file.basename.match(/^F-\d{3,}/)) continue;

			const fileContent = await this.app.vault.read(file);
			const fileFm = parseAnyFrontmatter(fileContent);
			if (!fileFm || !fileFm.id) continue;

			availableFeatures.push({
				id: fileFm.id as string,
				title: (fileFm.title as string) || file.basename,
				tier: (fileFm.tier as string) || "OSS",
				phase: String((fileFm.phase as string) || "MVP"),
			});
		}

		if (availableFeatures.length === 0) {
			new Notice("No features found in vault. Create a feature first.");
			return;
		}

		// Sort features by ID
		availableFeatures.sort((a, b) => a.id.localeCompare(b.id));

		// Show modal
		const modal = new LinkFeatureModal(
			this.app,
			{
				entityType,
				entityId,
				entityTitle,
				availableFeatures,
			},
			async (result: LinkFeatureModalResult) => {
				await this.applyFeatureLink(activeFile, entityId, result);
			}
		);
		modal.open();
	}

	/**
	 * Apply the feature link to the entity file
	 */
	private async applyFeatureLink(
		entityFile: TFile,
		entityId: string,
		linkResult: LinkFeatureModalResult
	): Promise<void> {
		const content = await this.app.vault.read(entityFile);
		const fm = parseAnyFrontmatter(content);
		if (!fm) return;

		// Get current array for the relationship type
		const fieldName = linkResult.relationshipType;
		const currentLinks = (fm[fieldName] as string[]) || [];

		// Add the feature ID if not already present
		if (!currentLinks.includes(linkResult.featureId)) {
			currentLinks.push(linkResult.featureId);
		}

		// Update the entity file
		const updatedContent = updateFrontmatter(content, {
			[fieldName]: currentLinks,
			updated: new Date().toISOString(),
		});
		await this.app.vault.modify(entityFile, updatedContent);

		new Notice(`Linked ${entityId} to ${linkResult.featureId} (${linkResult.relationshipType})`);

		// Trigger reconcile to update the feature's reverse relationship
		await this.reconcileAllRelationships();
	}

	/**
	 * Activate the Feature Details sidebar view
	 */
	private async activateFeatureDetailsView(): Promise<void> {
		const { workspace } = this.app;

		// Check if view is already open
		let leaf = workspace.getLeavesOfType(FEATURE_DETAILS_VIEW_TYPE)[0];

		if (!leaf) {
			// Create new leaf in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: FEATURE_DETAILS_VIEW_TYPE,
					active: true,
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Activate the Feature Coverage view
	 */
	private async activateFeatureCoverageView(): Promise<void> {
		const { workspace } = this.app;

		// Check if view is already open
		let leaf = workspace.getLeavesOfType(FEATURE_COVERAGE_VIEW_TYPE)[0];

		if (!leaf) {
			// Create new leaf as a tab
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: FEATURE_COVERAGE_VIEW_TYPE,
				active: true,
			});
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Import features from FUTURE_FEATURES.md file
	 */
	private async importFromFutureFeatures(): Promise<void> {
		// Look for FUTURE_FEATURES.md in vault root or docs folder
		const possiblePaths = ["FUTURE_FEATURES.md", "docs/FUTURE_FEATURES.md"];
		let futureFile: TFile | null = null;

		for (const path of possiblePaths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				futureFile = file;
				break;
			}
		}

		if (!futureFile) {
			new Notice("FUTURE_FEATURES.md not found in vault root or docs folder");
			return;
		}

		const content = await this.app.vault.read(futureFile);
		const features = this.parseFutureFeatures(content);

		if (features.length === 0) {
			new Notice("No features found in FUTURE_FEATURES.md");
			return;
		}

		// Create features folder if needed
		const featuresFolder = this.settings.entityNavigator.featuresFolder || "features";
		const folderExists = await this.app.vault.adapter.exists(featuresFolder);
		if (!folderExists) {
			await this.app.vault.createFolder(featuresFolder);
		}

		let created = 0;
		const now = new Date().toISOString();
		for (const ff of features) {
			const id = generateId(this.app, this.settings, "feature");
			const filename = `${id}_${ff.title.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}.md`;
			const filePath = `${featuresFolder}/${filename}`;

			// Check if file already exists
			if (await this.app.vault.adapter.exists(filePath)) continue;

			const tier: FeatureTier = ff.category?.toLowerCase().includes("premium") ? "Premium" : "OSS";
			const phase = this.mapCategoryToPhase(ff.category || "");
			const status: FeatureStatus = ff.status === "Not planned" ? "Deferred" : "Planned";

			const featureContent = replaceFeaturePlaceholders(DEFAULT_FEATURE_TEMPLATE, {
				id,
				type: "feature",
				title: ff.title,
				user_story: ff.description || `As a user, I want to ${ff.title.toLowerCase()}`,
				tier,
				phase,
				status,
				priority: "Medium",
				workstream: "engineering",
				personas: [],
				acceptance_criteria: [],
				last_updated: now,
				created_at: now,
				created_by_plugin: true,
			});

			await this.app.vault.create(filePath, featureContent);
			created++;
		}

		new Notice(`Imported ${created} features from FUTURE_FEATURES.md`);
	}

	/**
	 * Parse FUTURE_FEATURES.md content into feature objects
	 */
	private parseFutureFeatures(content: string): Array<{
		title: string;
		description?: string;
		category?: string;
		status?: string;
	}> {
		const features: Array<{
			title: string;
			description?: string;
			category?: string;
			status?: string;
		}> = [];

		const lines = content.split("\n");
		let currentCategory = "";

		for (const line of lines) {
			// Category headers (## or ###)
			const categoryMatch = line.match(/^#{2,3}\s+(.+)/);
			if (categoryMatch) {
				currentCategory = categoryMatch[1].trim();
				continue;
			}

			// Feature items (- [ ] or - [x] or just -)
			const featureMatch = line.match(/^[-*]\s+\[?[x ]?\]?\s*(.+)/i);
			if (featureMatch) {
				const featureText = featureMatch[1].trim();
				// Skip if it's a sub-item (indented)
				if (line.match(/^\s{2,}/)) continue;

				// Parse status from checkbox
				const isChecked = line.includes("[x]") || line.includes("[X]");
				const status = isChecked ? "Complete" : "Planned";

				features.push({
					title: featureText,
					category: currentCategory,
					status,
				});
			}
		}

		return features;
	}

	/**
	 * Map category string to feature phase
	 */
	private mapCategoryToPhase(category: string): FeaturePhase {
		const lower = category.toLowerCase();
		if (lower.includes("mvp") || lower.includes("core")) return "MVP";
		if (lower.includes("phase 0") || lower.includes("p0")) return "0";
		if (lower.includes("phase 1") || lower.includes("p1")) return "1";
		if (lower.includes("phase 2") || lower.includes("p2")) return "2";
		if (lower.includes("phase 3") || lower.includes("p3")) return "3";
		if (lower.includes("phase 4") || lower.includes("p4")) return "4";
		if (lower.includes("phase 5") || lower.includes("p5")) return "5";
		if (lower.includes("future") || lower.includes("later")) return "5";
		return "MVP";
	}

	/**
	 * Suggest feature links based on title similarity
	 */
	private async suggestFeatureLinks(): Promise<void> {
		if (!this.entityIndex?.isReady()) {
			new Notice("Entity index not ready. Please wait...");
			return;
		}

		const features = this.entityIndex.getByType("feature");
		const milestones = this.entityIndex.getByType("milestone");
		const stories = this.entityIndex.getByType("story");

		if (features.length === 0) {
			new Notice("No features found in vault");
			return;
		}

		const suggestions: Array<{
			feature: EntityIndexEntry;
			matches: EntityIndexEntry[];
		}> = [];

		for (const feature of features) {
			// Skip features that already have implementations
			if (feature.implemented_by.length > 0) continue;

			const matches: EntityIndexEntry[] = [];

			// Check milestones and stories for title similarity
			for (const entity of [...milestones, ...stories]) {
				if (this.titleSimilarity(feature.title, entity.title) > 0.4) {
					matches.push(entity);
				}
			}

			if (matches.length > 0) {
				suggestions.push({ feature, matches });
			}
		}

		if (suggestions.length === 0) {
			new Notice("No link suggestions found");
			return;
		}

		// Show first suggestion
		const first = suggestions[0];
		const matchTitles = first.matches.map(m => `${m.id}: ${m.title}`).join("\n");
		new Notice(
			`Feature "${first.feature.title}" may be implemented by:\n${matchTitles}\n\nUse "Link to Feature" command to create links.`,
			10000
		);
	}

	/**
	 * Simple title similarity check
	 */
	private titleSimilarity(a: string, b: string): number {
		const aWords = new Set(a.toLowerCase().split(/\s+/));
		const bWords = new Set(b.toLowerCase().split(/\s+/));
		let matches = 0;
		for (const word of aWords) {
			if (word.length > 2 && bWords.has(word)) matches++;
		}
		return matches / Math.max(aWords.size, bWords.size);
	}

	/**
	 * Bulk link features - show a modal to link multiple entities at once
	 */
	private async bulkLinkFeatures(): Promise<void> {
		if (!this.entityIndex?.isReady()) {
			new Notice("Entity index not ready. Please wait...");
			return;
		}

		const features = this.entityIndex.getByType("feature");
		if (features.length === 0) {
			new Notice("No features found in vault");
			return;
		}

		// For now, show a notice with instructions
		// A full bulk editor would require a more complex modal
		new Notice(
			"Bulk Link Features:\n\n" +
			"1. Open a milestone, story, or document\n" +
			"2. Use 'Link to Feature' command\n" +
			"3. Select the feature to link\n\n" +
			"Or use 'Reconcile All Relationships' to sync existing links.",
			10000
		);
	}

	/**
	 * Reconcile all bidirectional relationships across the entire vault.
	 * This scans all markdown files and syncs reverse relationships:
	 * - depends_on ↔ blocks
	 * - parent ↔ children
	 * - implements ↔ implemented_by
	 * - documents ↔ documented_by
	 * - affects ↔ decided_by
	 * - supersedes ↔ superseded_by
	 * - previous_version ↔ next_version
	 */
	private async reconcileAllRelationships(): Promise<void> {
		new Notice("Reconciling relationships across vault...");

		// Build maps for all relationships
		const reverseRels = new Map<string, {
			blocks: string[];
			children: string[];
			implementedBy: string[];
			documentedBy: string[];
			decidedBy: string[];
			supersededBy?: string;
			nextVersion?: string;
		}>();

		const entityIdToFile = new Map<string, TFile>();

		const ensureEntity = (entityId: string) => {
			if (!reverseRels.has(entityId)) {
				reverseRels.set(entityId, {
					blocks: [],
					children: [],
					implementedBy: [],
					documentedBy: [],
					decidedBy: [],
				});
			}
			return reverseRels.get(entityId)!;
		};

		// Helper to clean entity ID: remove brackets, quotes, and extract valid ID
		const cleanEntityId = (raw: string): string | null => {
			// Remove surrounding quotes and brackets
			let cleaned = raw.trim()
				.replace(/^["'\[\]]+|["'\[\]]+$/g, '')  // Remove leading/trailing quotes and brackets
				.replace(/^\[|\]$/g, '')  // Remove any remaining brackets
				.trim();

			// Check if it looks like a valid entity ID (e.g., T-096, S-001, M-024, F-012, D-001)
			if (/^[A-Z]+-\d+$/.test(cleaned)) {
				return cleaned;
			}
			return null;
		};

		// Use [ \t]* instead of \s* to avoid matching newlines
		const parseYamlArray = (text: string, key: string): string[] => {
			let rawItems: string[] = [];

			const multilineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'));
			if (multilineMatch) {
				const items = multilineMatch[1].match(/^[ \t]*-[ \t]*(.+)$/gm);
				if (items) {
					rawItems = items.map(item => item.replace(/^[ \t]*-[ \t]*/, '').trim());
				}
			} else {
				const inlineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\[([^\\]]+)\\]`, 'm'));
				if (inlineMatch) {
					rawItems = inlineMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
				} else {
					const singleMatch = text.match(new RegExp(`^${key}:[ \\t]*([^\\n\\[]+)$`, 'm'));
					if (singleMatch && singleMatch[1].trim()) {
						rawItems = [singleMatch[1].trim()];
					}
				}
			}

			// Clean and deduplicate
			const cleaned: string[] = [];
			for (const raw of rawItems) {
				const id = cleanEntityId(raw);
				if (id && !cleaned.includes(id)) {
					cleaned.push(id);
				}
			}
			return cleaned;
		};

		// Helper to get raw array values (before cleaning) to detect if cleanup is needed
		// Use [ \t]* instead of \s* to avoid matching newlines
		const parseYamlArrayRaw = (text: string, key: string): string[] => {
			const multilineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'));
			if (multilineMatch) {
				const items = multilineMatch[1].match(/^[ \t]*-[ \t]*(.+)$/gm);
				if (items) {
					return items.map(item => item.replace(/^[ \t]*-[ \t]*/, '').trim());
				}
			}
			const inlineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\[([^\\]]+)\\]`, 'm'));
			if (inlineMatch) {
				return inlineMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
			}
			const singleMatch = text.match(new RegExp(`^${key}:[ \\t]*([^\\n\\[]+)$`, 'm'));
			if (singleMatch && singleMatch[1].trim()) {
				return [singleMatch[1].trim()];
			}
			return [];
		};

		// Track forward relationships that need cleaning
		const forwardRelCleanup = new Map<string, {
			depends_on?: string[];
			implements?: string[];
			documents?: string[];
			affects?: string[];
		}>();

		// Scan all markdown files
		const allFiles = this.app.vault.getMarkdownFiles();
		let scannedCount = 0;

		for (const file of allFiles) {
			try {
				const content = await this.app.vault.read(file);
				const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
				if (!frontmatterMatch) continue;

				const fm = frontmatterMatch[1];
				// Use [ \t]* instead of \s* to avoid matching newlines
				const idMatch = fm.match(/^id:[ \t]*(.+)$/m);
				if (!idMatch) continue;

				const entityId = idMatch[1].trim();
				ensureEntity(entityId);
				entityIdToFile.set(entityId, file);
				scannedCount++;

				// Check if forward relationships need cleaning
				const forwardCleanup: {
					depends_on?: string[];
					implements?: string[];
					documents?: string[];
					affects?: string[];
				} = {};

				// depends_on -> blocks
				const dependsOnRaw = parseYamlArrayRaw(fm, 'depends_on');
				const dependsOn = parseYamlArray(fm, 'depends_on');
				if (dependsOnRaw.length !== dependsOn.length ||
					JSON.stringify(dependsOnRaw.sort()) !== JSON.stringify(dependsOn.sort())) {
					forwardCleanup.depends_on = dependsOn;
				}
				for (const depId of dependsOn) {
					const depRels = ensureEntity(depId);
					if (!depRels.blocks.includes(entityId)) {
						depRels.blocks.push(entityId);
					}
				}

				// parent -> children - use [ \t]* instead of \s* to avoid matching newlines
				const parentMatch = fm.match(/^parent:[ \t]*(.+)$/m);
				if (parentMatch) {
					const parentId = parentMatch[1].trim();
					const parentRels = ensureEntity(parentId);
					if (!parentRels.children.includes(entityId)) {
						parentRels.children.push(entityId);
					}
				}

				// implements -> implemented_by
				const implementsRaw = parseYamlArrayRaw(fm, 'implements');
				const implementsArr = parseYamlArray(fm, 'implements');
				if (implementsRaw.length !== implementsArr.length ||
					JSON.stringify(implementsRaw.sort()) !== JSON.stringify(implementsArr.sort())) {
					forwardCleanup.implements = implementsArr;
				}
				for (const featureId of implementsArr) {
					const featureRels = ensureEntity(featureId);
					if (!featureRels.implementedBy.includes(entityId)) {
						featureRels.implementedBy.push(entityId);
					}
				}

				// documents -> documented_by
				const documentsRaw = parseYamlArrayRaw(fm, 'documents');
				const documentsArr = parseYamlArray(fm, 'documents');
				if (documentsRaw.length !== documentsArr.length ||
					JSON.stringify(documentsRaw.sort()) !== JSON.stringify(documentsArr.sort())) {
					forwardCleanup.documents = documentsArr;
				}
				for (const featureId of documentsArr) {
					const featureRels = ensureEntity(featureId);
					if (!featureRels.documentedBy.includes(entityId)) {
						featureRels.documentedBy.push(entityId);
					}
				}

				// affects -> decided_by
				const affectsRaw = parseYamlArrayRaw(fm, 'affects');
				const affectsArr = parseYamlArray(fm, 'affects');
				if (affectsRaw.length !== affectsArr.length ||
					JSON.stringify(affectsRaw.sort()) !== JSON.stringify(affectsArr.sort())) {
					forwardCleanup.affects = affectsArr;
				}
				for (const featureId of affectsArr) {
					const featureRels = ensureEntity(featureId);
					if (!featureRels.decidedBy.includes(entityId)) {
						featureRels.decidedBy.push(entityId);
					}
				}

				// supersedes -> superseded_by
				// Use [ \t]* instead of \s* to avoid matching newlines
				const supersedesMatch = fm.match(/^supersedes:[ \t]*(.+)$/m);
				if (supersedesMatch) {
					const supersededId = supersedesMatch[1].trim();
					const supersededRels = ensureEntity(supersededId);
					supersededRels.supersededBy = entityId;
				}

				// previous_version -> next_version
				// Use [ \t]* instead of \s* to avoid matching newlines
				const prevVersionMatch = fm.match(/^previous_version:[ \t]*(.+)$/m);
				if (prevVersionMatch) {
					const prevId = prevVersionMatch[1].trim();
					const prevRels = ensureEntity(prevId);
					prevRels.nextVersion = entityId;
				}

				// Store cleanup needed for this entity
				if (Object.keys(forwardCleanup).length > 0) {
					forwardRelCleanup.set(entityId, forwardCleanup);
				}
			} catch (e) {
				console.warn('[Canvas Plugin] Failed to read file for reconcile:', file.path, e);
			}
		}

		// Now update each entity's file with computed reverse relationships AND forward cleanup
		let updatedCount = 0;

		for (const [entityId, rels] of reverseRels.entries()) {
			const file = entityIdToFile.get(entityId);
			if (!file) continue;

			try {
				const content = await this.app.vault.read(file);
				const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
				if (!frontmatterMatch) continue;

				const fm = frontmatterMatch[1];

				// Check current values for reverse relationships
				const currentBlocks = parseYamlArray(fm, 'blocks');
				const currentChildren = parseYamlArray(fm, 'children');
				const currentImplementedBy = parseYamlArray(fm, 'implemented_by');
				const currentDocumentedBy = parseYamlArray(fm, 'documented_by');
				const currentDecidedBy = parseYamlArray(fm, 'decided_by');
				// Use [ \t]* instead of \s* to avoid matching newlines
				const supersededByMatch = fm.match(/^superseded_by:[ \t]*(.+)$/m);
				const currentSupersededBy = supersededByMatch?.[1]?.trim();
				const nextVersionMatch = fm.match(/^next_version:[ \t]*(.+)$/m);
				const currentNextVersion = nextVersionMatch?.[1]?.trim();

				// Compare reverse relationships
				const blocksChanged = JSON.stringify([...currentBlocks].sort()) !== JSON.stringify([...rels.blocks].sort());
				const childrenChanged = JSON.stringify([...currentChildren].sort()) !== JSON.stringify([...rels.children].sort());
				const implementedByChanged = JSON.stringify([...currentImplementedBy].sort()) !== JSON.stringify([...rels.implementedBy].sort());
				const documentedByChanged = JSON.stringify([...currentDocumentedBy].sort()) !== JSON.stringify([...rels.documentedBy].sort());
				const decidedByChanged = JSON.stringify([...currentDecidedBy].sort()) !== JSON.stringify([...rels.decidedBy].sort());
				const supersededByChanged = currentSupersededBy !== rels.supersededBy;
				const nextVersionChanged = currentNextVersion !== rels.nextVersion;

				// Check if forward relationships need cleanup
				const forwardCleanup = forwardRelCleanup.get(entityId);
				const hasForwardCleanup = forwardCleanup && Object.keys(forwardCleanup).length > 0;

				if (blocksChanged || childrenChanged || implementedByChanged || documentedByChanged || decidedByChanged || supersededByChanged || nextVersionChanged || hasForwardCleanup) {
					const updates: Record<string, unknown> = {
						updated: new Date().toISOString(),
					};

					// Reverse relationship updates
					if (blocksChanged && rels.blocks.length > 0) {
						updates.blocks = rels.blocks;
					}
					if (childrenChanged && rels.children.length > 0) {
						updates.children = rels.children;
					}
					if (implementedByChanged && rels.implementedBy.length > 0) {
						updates.implemented_by = rels.implementedBy;
					}
					if (documentedByChanged && rels.documentedBy.length > 0) {
						updates.documented_by = rels.documentedBy;
					}
					if (decidedByChanged && rels.decidedBy.length > 0) {
						updates.decided_by = rels.decidedBy;
					}
					if (supersededByChanged && rels.supersededBy) {
						updates.superseded_by = rels.supersededBy;
					}
					if (nextVersionChanged && rels.nextVersion) {
						updates.next_version = rels.nextVersion;
					}

					// Forward relationship cleanup (remove malformed entries and duplicates)
					if (forwardCleanup) {
						if (forwardCleanup.depends_on) {
							updates.depends_on = forwardCleanup.depends_on;
						}
						if (forwardCleanup.implements) {
							updates.implements = forwardCleanup.implements;
						}
						if (forwardCleanup.documents) {
							updates.documents = forwardCleanup.documents;
						}
						if (forwardCleanup.affects) {
							updates.affects = forwardCleanup.affects;
						}
					}

					const updatedContent = updateFrontmatter(content, updates);
					await this.app.vault.modify(file, updatedContent);
					updatedCount++;
				}
			} catch (e) {
				console.warn('[Canvas Plugin] Failed to update file for reconcile:', file.path, e);
			}
		}

		new Notice(`Reconciled ${scannedCount} entities, updated ${updatedCount} files`);
		console.debug('[Canvas Plugin] Reconcile complete:', { scannedCount, updatedCount });

		// Detect and break cycles in milestone dependencies
		const allEntityFiles = Array.from(entityIdToFile.values());
		const cycleResult = await detectAndBreakCycles(this.app, allEntityFiles, "milestone");
		if (cycleResult.cyclesFound > 0) {
			console.log(`[Canvas Plugin] Broke ${cycleResult.cyclesFound} cycles:`, cycleResult.edgesRemoved);
		}
	}

	// ==================== HTTP SERVER ====================

	/**
	 * Start the HTTP server for external API access.
	 * Listens for POST requests to trigger plugin functions.
	 */
	private startHttpServer(): void {
		if (!this.settings.httpServerEnabled) {
			console.debug('[Canvas Plugin] HTTP server disabled in settings');
			return;
		}

		const port = this.settings.httpServerPort;

		this.httpServer = http.createServer(async (req, res) => {
			// Set CORS headers
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

			// Handle preflight
			if (req.method === 'OPTIONS') {
				res.writeHead(204);
				res.end();
				return;
			}

			// Only accept POST requests
			if (req.method !== 'POST') {
				res.writeHead(405, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
				return;
			}

			// Parse request body
			let body = '';
			req.on('data', chunk => { body += chunk.toString(); });
			req.on('end', async () => {
				try {
					const data = body ? JSON.parse(body) : {};
					const action = data.action || req.url?.replace('/', '');

					console.log('[Canvas Plugin] HTTP request received:', { action, data });

					let result: { success: boolean; message: string; error?: string };

					switch (action) {
						case 'populate':
						case 'populate-from-vault':
							await this.populateCanvasFromVault();
							result = { success: true, message: 'Populate from vault completed' };
							break;

						case 'reposition':
						case 'reposition-nodes':
							await this.repositionCanvasNodesV4();
							result = { success: true, message: 'Reposition nodes (V4) completed' };
							break;

						case 'reposition-v3':
						case 'reposition-nodes-v3':
							await this.repositionCanvasNodesV3();
							result = { success: true, message: 'Reposition nodes (V3) completed' };
							break;

						case 'reposition-v2':
						case 'reposition-nodes-v2':
							await this.repositionCanvasNodes();
							result = { success: true, message: 'Reposition nodes (V2 legacy) completed' };
							break;

						default:
							result = {
								success: false,
								message: 'Unknown action',
								error: `Unknown action: ${action}. Valid actions: populate, reposition, reposition-v2`
							};
					}

					res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(result));

				} catch (error) {
					console.error('[Canvas Plugin] HTTP request error:', error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						success: false,
						error: (error as Error).message
					}));
				}
			});
		});

		this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
			if (error.code === 'EADDRINUSE') {
				console.error(`[Canvas Plugin] HTTP server port ${port} is already in use`);
				new Notice(`❌ HTTP server port ${port} is already in use`);
			} else {
				console.error('[Canvas Plugin] HTTP server error:', error);
				new Notice(`❌ HTTP server error: ${error.message}`);
			}
			this.httpServer = null;
		});

		this.httpServer.listen(port, '127.0.0.1', () => {
			console.log(`[Canvas Plugin] HTTP server listening on http://127.0.0.1:${port}`);
			new Notice(`✅ HTTP server started on port ${port}`);
		});
	}

	/**
	 * Stop the HTTP server.
	 */
	private stopHttpServer(): void {
		if (this.httpServer) {
			this.httpServer.close(() => {
				console.log('[Canvas Plugin] HTTP server stopped');
			});
			this.httpServer = null;
		}
	}

	/**
	 * Restart the HTTP server (e.g., when settings change).
	 */
	public restartHttpServer(): void {
		this.stopHttpServer();
		this.startHttpServer();
	}
}


