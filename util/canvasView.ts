import { App, TFile, View, WorkspaceLeaf } from "obsidian";
import { CanvasNode } from "./canvas";

/**
 * Internal canvas view interface (not part of public Obsidian API)
 * Using unknown for canvas internals since they're not typed
 */
interface CanvasView extends View {
	file?: TFile;
	canvas?: InternalCanvasObject;
}

/**
 * Internal canvas edge interface
 */
interface InternalCanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: string;
	toSide?: string;
	label?: string;
}

/**
 * Internal canvas object interface
 */
interface InternalCanvasObject {
	data?: { nodes: CanvasNode[]; edges?: InternalCanvasEdge[] };
	nodes?: Map<string, unknown>;
	edges?: Map<string, unknown>;
	createFileNode?: (opts: {
		pos: { x: number; y: number };
		size: { width: number; height: number };
		file: TFile;
		save: boolean;
		focus: boolean;
	}) => { setColor?: (color: string) => void } | undefined;
	// Edge creation - may or may not exist
	addEdge?: (edge: InternalCanvasEdge) => unknown;
	createEdge?: (fromNode: unknown, toNode: unknown, opts?: unknown) => unknown;
	requestSave?: () => void;
	requestFrame?: () => void;
}

/**
 * Result of getting canvas view
 */
export interface CanvasViewResult {
	leaf: WorkspaceLeaf;
	view: CanvasView;
	canvas: InternalCanvasObject;
}

/**
 * Directly add a node to an open canvas view without touching the file
 * This updates the in-memory canvas data and triggers a save
 */
export function addNodeToCanvasView(
	app: App,
	canvasFile: TFile,
	node: CanvasNode
): boolean {
	const leaves = app.workspace.getLeavesOfType("canvas");

	for (const leaf of leaves) {
		const view = leaf.view as CanvasView;
		if (view.file?.path === canvasFile.path) {
			try {
				console.debug('[Canvas Plugin] Found open canvas view, adding node directly');

				// Get the actual TFile object for the note
				const noteFile = app.vault.getAbstractFileByPath(node.file ?? "");
				if (!(noteFile instanceof TFile)) {
					console.error('[Canvas Plugin] Note file not found:', node.file);
					return false;
				}

				// Access the canvas's internal data
				if (view.canvas?.data) {
					// Add node to canvas data
					view.canvas.data.nodes.push(node);

					// Create the visual node in the canvas
					if (view.canvas.createFileNode) {
						const visualNode = view.canvas.createFileNode({
							pos: { x: node.x, y: node.y },
							size: { width: node.width, height: node.height },
							file: noteFile, // Pass the actual TFile object
							save: true, // Let canvas save automatically
							focus: false, // Don't focus on the new node
						});

						if (node.color && visualNode?.setColor) {
							visualNode.setColor(node.color);
						}

						console.debug('[Canvas Plugin] Visual node created successfully');
					}

					// Mark canvas as dirty and request save
					if (view.canvas.requestSave) {
						view.canvas.requestSave();
					}

					console.debug('[Canvas Plugin] Node added directly to canvas view');
					return true;
				}
			} catch (error) {
				console.error('[Canvas Plugin] Failed to add node to canvas view:', error);
			}
		}
	}

	return false;
}

/**
 * Check if canvas is currently open
 */
export function isCanvasOpen(app: App, canvasFile: TFile): boolean {
	const leaves = app.workspace.getLeavesOfType("canvas");
	return leaves.some((leaf) => {
		const view = leaf.view as CanvasView;
		return view.file?.path === canvasFile.path;
	});
}

/**
 * Get the canvas view for a specific canvas file
 * Returns null if canvas is not open or internal API is not available
 */
export function getCanvasView(app: App, canvasFile: TFile): CanvasViewResult | null {
	const leaves = app.workspace.getLeavesOfType("canvas");

	for (const leaf of leaves) {
		const view = leaf.view as CanvasView;
		if (view.file?.path === canvasFile.path && view.canvas) {
			return { leaf, view, canvas: view.canvas };
		}
	}

	return null;
}

/**
 * Check if the internal canvas API is available for batch operations
 */
export function hasInternalCanvasAPI(canvas: InternalCanvasObject): boolean {
	return !!(canvas.createFileNode && canvas.requestSave);
}

/**
 * Add multiple nodes to canvas using the internal API (batch operation)
 * This is more efficient than adding nodes one by one
 *
 * @returns Object with success count and failed nodes
 */
export function addNodesToCanvasView(
	app: App,
	canvasFile: TFile,
	nodes: CanvasNode[]
): { success: number; failed: CanvasNode[]; usedInternalAPI: boolean } {
	const result = { success: 0, failed: [] as CanvasNode[], usedInternalAPI: false };

	if (nodes.length === 0) {
		return result;
	}

	const canvasViewResult = getCanvasView(app, canvasFile);

	if (!canvasViewResult) {
		console.log('[Canvas Plugin] Canvas not open, cannot use internal API');
		result.failed = [...nodes];
		return result;
	}

	const { canvas } = canvasViewResult;

	if (!hasInternalCanvasAPI(canvas)) {
		console.log('[Canvas Plugin] Internal canvas API not available');
		result.failed = [...nodes];
		return result;
	}

	result.usedInternalAPI = true;
	console.log('[Canvas Plugin] Using internal canvas API to add', nodes.length, 'nodes');

	for (const node of nodes) {
		try {
			// Get the actual TFile object for the note
			const noteFile = app.vault.getAbstractFileByPath(node.file ?? "");
			if (!(noteFile instanceof TFile)) {
				console.warn('[Canvas Plugin] Note file not found:', node.file);
				result.failed.push(node);
				continue;
			}

			// Create the visual node using internal API
			// Note: createFileNode automatically adds to canvas.data.nodes
			const visualNode = canvas.createFileNode!({
				pos: { x: node.x, y: node.y },
				size: { width: node.width, height: node.height },
				file: noteFile,
				save: false, // Don't save after each node, we'll batch save at the end
				focus: false,
			});

			// Apply color if specified
			if (node.color && visualNode?.setColor) {
				visualNode.setColor(node.color);
			}

			result.success++;
		} catch (error) {
			console.error('[Canvas Plugin] Failed to add node:', node.file, error);
			result.failed.push(node);
		}
	}

	// Request a single save after all nodes are added
	if (result.success > 0) {
		console.log('[Canvas Plugin] Requesting canvas save after adding', result.success, 'nodes');
		canvas.requestSave!();

		// Also request a frame update to ensure visual refresh
		if (canvas.requestFrame) {
			canvas.requestFrame();
		}
	}

	console.log('[Canvas Plugin] Batch add complete:', result.success, 'success,', result.failed.length, 'failed');
	return result;
}

/**
 * Inspect the canvas object to find available methods for edge creation
 * This is for debugging - call this to see what APIs are available
 */
export function inspectCanvasAPI(app: App, canvasFile: TFile): void {
	const canvasViewResult = getCanvasView(app, canvasFile);
	if (!canvasViewResult) {
		console.log('[Canvas Plugin] Canvas not open');
		return;
	}

	const { canvas } = canvasViewResult;

	console.log('[Canvas Plugin] === CANVAS API INSPECTION ===');
	console.log('canvas object keys:', Object.keys(canvas));
	console.log('canvas.data:', canvas.data);
	console.log('canvas.nodes:', canvas.nodes);
	console.log('canvas.edges:', canvas.edges);

	// Look for edge-related methods
	const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(canvas));
	console.log('canvas prototype methods:', methods);

	const edgeMethods = methods.filter(m => m.toLowerCase().includes('edge'));
	console.log('Edge-related methods:', edgeMethods);

	// Check if addEdge or createEdge exist
	console.log('canvas.addEdge:', typeof (canvas as any).addEdge);
	console.log('canvas.createEdge:', typeof (canvas as any).createEdge);
	console.log('canvas.edges?.set:', typeof canvas.edges?.set);
}

/**
 * Try to add edges using internal canvas API
 * Returns true if successful, false if API not available
 */
export function addEdgesToCanvasView(
	app: App,
	canvasFile: TFile,
	edges: InternalCanvasEdge[]
): { success: number; failed: InternalCanvasEdge[]; usedInternalAPI: boolean } {
	const result = { success: 0, failed: [] as InternalCanvasEdge[], usedInternalAPI: false };

	if (edges.length === 0) {
		return result;
	}

	const canvasViewResult = getCanvasView(app, canvasFile);
	if (!canvasViewResult) {
		console.log('[Canvas Plugin] Canvas not open, cannot use internal API for edges');
		result.failed = [...edges];
		return result;
	}

	const { canvas } = canvasViewResult;

	// Try to find edge creation method
	const canvasAny = canvas as any;

	// Method 1: Direct addEdge method
	if (typeof canvasAny.addEdge === 'function') {
		console.log('[Canvas Plugin] Found addEdge method, using it');
		result.usedInternalAPI = true;

		for (const edge of edges) {
			try {
				canvasAny.addEdge(edge);
				result.success++;
			} catch (e) {
				console.error('[Canvas Plugin] addEdge failed:', e);
				result.failed.push(edge);
			}
		}
	}
	// Method 2: Add to data.edges array directly
	else if (canvas.data?.edges && Array.isArray(canvas.data.edges)) {
		console.log('[Canvas Plugin] Adding edges directly to canvas.data.edges');
		result.usedInternalAPI = true;

		for (const edge of edges) {
			try {
				canvas.data.edges.push(edge);
				result.success++;
			} catch (e) {
				console.error('[Canvas Plugin] Direct edge add failed:', e);
				result.failed.push(edge);
			}
		}

		// Request save after adding all edges
		if (result.success > 0 && canvas.requestSave) {
			canvas.requestSave();
		}
	}
	// Method 3: Add to edges Map
	else if (canvas.edges && typeof canvas.edges.set === 'function') {
		console.log('[Canvas Plugin] Adding edges to canvas.edges Map');
		result.usedInternalAPI = true;

		for (const edge of edges) {
			try {
				canvas.edges.set(edge.id, edge);
				result.success++;
			} catch (e) {
				console.error('[Canvas Plugin] Map edge add failed:', e);
				result.failed.push(edge);
			}
		}

		// Request save after adding all edges
		if (result.success > 0 && canvas.requestSave) {
			canvas.requestSave();
		}
	}
	else {
		console.log('[Canvas Plugin] No internal API found for edges');
		result.failed = [...edges];
	}

	if (result.success > 0 && canvas.requestFrame) {
		canvas.requestFrame();
	}

	console.log('[Canvas Plugin] Edge add complete:', result.success, 'success,', result.failed.length, 'failed');
	return result;
}

