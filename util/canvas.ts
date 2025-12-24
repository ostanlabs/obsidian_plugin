import { App, TFile, WorkspaceLeaf } from "obsidian";
import { InternalCanvasView } from "../types";

/**
 * Canvas node types from Obsidian Canvas format
 */
export interface CanvasNode {
	id: string;
	type: "text" | "file" | "link" | "group";
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	text?: string;
	file?: string;
	url?: string;
	label?: string;
	metadata?: {
		plugin?: string;
		collapsed?: boolean;
		alias?: string;
		shape?: string;
		effortColor?: string;
		showId?: boolean;
		expandedFields?: string[];
		expandedSize?: { width: number; height: number };
		[key: string]: unknown;
	};
	styleAttributes?: Record<string, unknown>;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide: string;
	toNode: string;
	toSide: string;
	label?: string;
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

/**
 * Load canvas data from a .canvas file
 */
export async function loadCanvasData(app: App, canvasFile: TFile): Promise<CanvasData> {
	const content = await app.vault.read(canvasFile);
	return JSON.parse(content) as CanvasData;
}

/**
 * Save canvas data to a .canvas file
 */
export async function saveCanvasData(
	app: App,
	canvasFile: TFile,
	data: CanvasData
): Promise<void> {
	const content = JSON.stringify(data, null, 2);
	console.debug('[Canvas Plugin] Saving canvas data:', {
		path: canvasFile.path,
		nodeCount: data.nodes.length,
		fileNodeCount: data.nodes.filter(n => n.type === 'file').length,
		lastNode: data.nodes[data.nodes.length - 1]
	});
	await app.vault.modify(canvasFile, content);
	console.debug('[Canvas Plugin] Canvas saved successfully');
}

/**
 * Find a node by ID
 */
export function findNodeById(data: CanvasData, nodeId: string): CanvasNode | undefined {
	return data.nodes.find((node) => node.id === nodeId);
}

/**
 * Convert a text node to a file node
 */
export function convertTextNodeToFile(
	node: CanvasNode,
	filePath: string,
	metadata?: CanvasNode["metadata"]
): CanvasNode {
	if (node.type !== "text") {
		throw new Error("Can only convert text nodes to file nodes");
	}

	return {
		...node,
		type: "file",
		file: filePath,
		text: undefined, // Remove text property
		metadata: metadata ?? node.metadata,
	};
}

/**
 * Create a new node at specified position
 */
export function createNode(
	type: "text" | "file",
	x: number,
	y: number,
	width = 400,
	height = 100,
	content?: { text?: string; file?: string; color?: string; metadata?: CanvasNode["metadata"] }
): CanvasNode {
	const id = generateNodeId();

	const node: CanvasNode = {
		id,
		type,
		x,
		y,
		width,
		height,
	};

	if (type === "text" && content?.text) {
		node.text = content.text;
	} else if (type === "file" && content?.file) {
		node.file = content.file;
	}

	// Add color if provided
	if (content?.color) {
		node.color = content.color;
	}

	// Add metadata if provided
	if (content?.metadata) {
		node.metadata = content.metadata;
	}

	return node;
}

/**
 * Generate a unique node ID
 */
export function generateNodeId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get the center position of a canvas
 * Returns a default center position with slight randomization
 */
export function getCanvasCenter(app: App, canvasFile?: TFile): { x: number; y: number } {
	// Try to get the viewport center from the open canvas view
	if (app && canvasFile) {
		try {
			const leaves = app.workspace.getLeavesOfType("canvas");
			const canvasLeaf = leaves.find(leaf => {
				const view = leaf.view as InternalCanvasView;
				return view.file?.path === canvasFile.path;
			});

			if (canvasLeaf) {
				const view = canvasLeaf.view as InternalCanvasView;
				if (view.canvas) {
					// Get the current viewport position and dimensions
					const x = view.canvas.x ?? 0;
					const y = view.canvas.y ?? 0;
					const zoom = view.canvas.zoom ?? 1;

					// Get the canvas container dimensions
					const container = view.canvas.wrapperEl;
					if (container) {
						const rect = container.getBoundingClientRect();
						const viewportWidth = rect.width / zoom;
						const viewportHeight = rect.height / zoom;

						// Calculate the center of the visible viewport
						const centerX = x + viewportWidth / 2;
						const centerY = y + viewportHeight / 2;

						// Add small randomization to avoid exact stacking
						const randomOffsetX = Math.floor(Math.random() * 100) - 50;
						const randomOffsetY = Math.floor(Math.random() * 100) - 50;

						return {
							x: centerX + randomOffsetX,
							y: centerY + randomOffsetY
						};
					}
				}
			}
		} catch (error) {
			console.warn('[Canvas Plugin] Failed to get viewport center, using fallback:', error);
		}
	}
	
	// Fallback: default center with randomization
	const randomOffsetX = Math.floor(Math.random() * 100) - 50;
	const randomOffsetY = Math.floor(Math.random() * 100) - 50;
	return { x: randomOffsetX, y: randomOffsetY };
}

/**
 * Get color for effort avenue (matching visual grammar)
 */
export function getColorForEffort(effort: string): string | undefined {
	const colorMap: { [key: string]: string } = {
		Business: "6", // purple
		Infra: "4", // orange
		Engineering: "3", // blue
		Research: "2", // green
		Design: "1", // red
		Marketing: "5", // yellow
	};

	return colorMap[effort];
}

/**
 * Update a node in canvas data
 */
export function updateNode(data: CanvasData, nodeId: string, updates: Partial<CanvasNode>): void {
	const nodeIndex = data.nodes.findIndex((n) => n.id === nodeId);
	if (nodeIndex === -1) {
		throw new Error(`Node with ID ${nodeId} not found`);
	}

	data.nodes[nodeIndex] = {
		...data.nodes[nodeIndex],
		...updates,
	};
}

/**
 * Add a node to canvas data
 */
export function addNode(data: CanvasData, node: CanvasNode): void {
	data.nodes.push(node);
}

/**
 * Remove a node from canvas data
 */
export function removeNode(data: CanvasData, nodeId: string): boolean {
	const initialLength = data.nodes.length;
	data.nodes = data.nodes.filter((n) => n.id !== nodeId);
	return data.nodes.length < initialLength;
}

/**
 * Generate a unique edge ID
 */
export function generateEdgeId(): string {
	return `edge-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a new edge between two nodes
 * @param fromNodeId - Source node ID
 * @param toNodeId - Target node ID
 * @param label - Optional label for the edge (e.g., "depends on", "blocks", "parent")
 * @param fromSide - Side of source node to connect from (default: "bottom")
 * @param toSide - Side of target node to connect to (default: "top")
 */
export function createEdge(
	fromNodeId: string,
	toNodeId: string,
	label?: string,
	fromSide: "top" | "right" | "bottom" | "left" = "bottom",
	toSide: "top" | "right" | "bottom" | "left" = "top"
): CanvasEdge {
	return {
		id: generateEdgeId(),
		fromNode: fromNodeId,
		toNode: toNodeId,
		fromSide,
		toSide,
		...(label && { label }),
	};
}

/**
 * Add an edge to canvas data
 */
export function addEdge(data: CanvasData, edge: CanvasEdge): void {
	data.edges.push(edge);
}

/**
 * Check if an edge already exists between two nodes
 */
export function edgeExists(data: CanvasData, fromNodeId: string, toNodeId: string): boolean {
	return data.edges.some(
		(edge) => edge.fromNode === fromNodeId && edge.toNode === toNodeId
	);
}

/**
 * Find a node by its file path
 */
export function findNodeByFilePath(data: CanvasData, filePath: string): CanvasNode | undefined {
	return data.nodes.find((node) => node.type === "file" && node.file === filePath);
}

/**
 * Find a node by entity ID (stored in metadata or extracted from file path)
 */
export function findNodeByEntityId(data: CanvasData, entityId: string): CanvasNode | undefined {
	return data.nodes.find((node) => {
		// Check metadata first
		if (node.metadata?.entityId === entityId) {
			return true;
		}
		// Check if file path contains the entity ID
		if (node.type === "file" && node.file) {
			// Entity files are typically named like "M-001 Title.md" or stored in folders
			const fileName = node.file.split("/").pop() || "";
			if (fileName.startsWith(entityId + " ") || fileName.startsWith(entityId + ".")) {
				return true;
			}
		}
		return false;
	});
}

/**
 * Close all canvas views for a specific canvas file
 * Returns the leaves that were closed for reopening later
 */
export async function closeCanvasViews(app: App, canvasFile: TFile): Promise<WorkspaceLeaf[]> {
	const leaves = app.workspace.getLeavesOfType("canvas");
	const closedLeaves: WorkspaceLeaf[] = [];
	
	console.debug('[Canvas Plugin] closeCanvasViews:', {
		totalCanvasLeaves: leaves.length,
		targetFile: canvasFile.path
	});
	
	for (const leaf of leaves) {
		const view = leaf.view as InternalCanvasView;
		console.debug('[Canvas Plugin] Checking leaf:', {
			viewType: leaf.view?.getViewType(),
			viewFile: view.file?.path
		});
		if (view.file?.path === canvasFile.path) {
			console.debug('[Canvas Plugin] Closing matching canvas view');
			closedLeaves.push(leaf);
			await leaf.setViewState({
				type: "empty",
			});
		}
	}
	
	console.debug('[Canvas Plugin] Closed', closedLeaves.length, 'canvas views');
	return closedLeaves;
}

/**
 * Reopen canvas views that were previously closed
 */
export async function reopenCanvasViews(app: App, canvasFile: TFile, leaves: WorkspaceLeaf[]): Promise<void> {
	// Give a small delay to ensure file system changes are flushed
	await new Promise(resolve => setTimeout(resolve, 100));
	
	for (const leaf of leaves) {
		await leaf.setViewState({
			type: "canvas",
			state: {
				file: canvasFile.path,
			},
		});
	}
	
	// If no leaves were reopened, the canvas is not currently open
	// Don't create a new one - let the user open it manually
}

/**
 * Reload all canvas views for a specific canvas file
 * This forces Obsidian to re-read the canvas JSON from disk
 */
export async function reloadCanvasViews(app: App, canvasFile: TFile): Promise<void> {
	// Close all canvas views
	const closedLeaves = await closeCanvasViews(app, canvasFile);

	// Reopen them after a delay
	await reopenCanvasViews(app, canvasFile, closedLeaves);
}

/**
 * Viewport state for canvas
 */
export interface CanvasViewport {
	x: number;
	y: number;
	zoom: number;
}

/**
 * Capture the current viewport state (position and zoom) of a canvas
 */
export function captureCanvasViewport(app: App, canvasFile: TFile): CanvasViewport | null {
	const leaves = app.workspace.getLeavesOfType("canvas");

	for (const leaf of leaves) {
		const view = leaf.view as InternalCanvasView;
		if (view.file?.path === canvasFile.path && view.canvas) {
			const viewport: CanvasViewport = {
				x: view.canvas.x ?? 0,
				y: view.canvas.y ?? 0,
				zoom: view.canvas.zoom ?? 1,
			};
			console.debug('[Canvas Plugin] Captured viewport:', viewport);
			return viewport;
		}
	}

	console.debug('[Canvas Plugin] No canvas view found to capture viewport');
	return null;
}

/**
 * Restore the viewport state (position and zoom) of a canvas
 */
export async function restoreCanvasViewport(
	app: App,
	canvasFile: TFile,
	viewport: CanvasViewport,
	maxRetries: number = 10,
	retryDelay: number = 50
): Promise<boolean> {
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const leaves = app.workspace.getLeavesOfType("canvas");

		for (const leaf of leaves) {
			const view = leaf.view as InternalCanvasView;
			if (view.file?.path === canvasFile.path && view.canvas) {
				try {
					const canvas = view.canvas;
					// Try to set viewport using setViewport if available
					if (typeof canvas.setViewport === 'function') {
						canvas.setViewport(viewport.x, viewport.y, viewport.zoom);
						console.debug('[Canvas Plugin] Restored viewport via setViewport:', viewport);
						return true;
					}

					// Fallback: set properties directly
					canvas.x = viewport.x;
					canvas.y = viewport.y;
					canvas.zoom = viewport.zoom;

					// Request a frame update to apply changes
					if (typeof canvas.requestFrame === 'function') {
						canvas.requestFrame();
					}

					// Also try markViewportChanged if available
					if (typeof canvas.markViewportChanged === 'function') {
						canvas.markViewportChanged();
					}

					console.debug('[Canvas Plugin] Restored viewport via direct properties:', viewport);
					return true;
				} catch (error) {
					console.warn('[Canvas Plugin] Failed to restore viewport:', error);
				}
			}
		}

		// Wait before retrying (canvas might not be fully loaded yet)
		await new Promise(resolve => setTimeout(resolve, retryDelay));
	}

	console.warn('[Canvas Plugin] Could not restore viewport after', maxRetries, 'attempts');
	return false;
}

/**
 * Reload canvas views with viewport preservation
 * Captures viewport before reload and restores it after
 */
export async function reloadCanvasViewsWithViewport(app: App, canvasFile: TFile): Promise<void> {
	// Capture current viewport
	const viewport = captureCanvasViewport(app, canvasFile);

	// Close all canvas views
	const closedLeaves = await closeCanvasViews(app, canvasFile);

	if (closedLeaves.length === 0) {
		console.debug('[Canvas Plugin] No canvas views to reload');
		return;
	}

	// Reopen them after a delay
	await reopenCanvasViews(app, canvasFile, closedLeaves);

	// Restore viewport if we captured one
	if (viewport) {
		// Give the canvas a moment to initialize
		await new Promise(resolve => setTimeout(resolve, 150));
		await restoreCanvasViewport(app, canvasFile, viewport);
	}
}


