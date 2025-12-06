import { App, TFile, WorkspaceLeaf } from "obsidian";

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
	console.log('[Canvas Plugin] Saving canvas data:', {
		path: canvasFile.path,
		nodeCount: data.nodes.length,
		fileNodeCount: data.nodes.filter(n => n.type === 'file').length,
		lastNode: data.nodes[data.nodes.length - 1]
	});
	await app.vault.modify(canvasFile, content);
	console.log('[Canvas Plugin] Canvas saved successfully');
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
	filePath: string
): CanvasNode {
	if (node.type !== "text") {
		throw new Error("Can only convert text nodes to file nodes");
	}

	return {
		...node,
		type: "file",
		file: filePath,
		text: undefined, // Remove text property
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
	content?: { text?: string; file?: string; color?: string }
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
export function getCanvasCenter(): { x: number; y: number } {
	// Add some randomization so multiple items don't stack exactly on top of each other
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
 * Close all canvas views for a specific canvas file
 * Returns the leaves that were closed for reopening later
 */
export async function closeCanvasViews(app: App, canvasFile: TFile): Promise<WorkspaceLeaf[]> {
	const leaves = app.workspace.getLeavesOfType("canvas");
	const closedLeaves: WorkspaceLeaf[] = [];
	
	console.log('[Canvas Plugin] closeCanvasViews:', {
		totalCanvasLeaves: leaves.length,
		targetFile: canvasFile.path
	});
	
	for (const leaf of leaves) {
		const view = leaf.view as any;
		console.log('[Canvas Plugin] Checking leaf:', {
			viewType: leaf.view?.getViewType(),
			viewFile: view.file?.path
		});
		if (view.file?.path === canvasFile.path) {
			console.log('[Canvas Plugin] Closing matching canvas view');
			closedLeaves.push(leaf);
			await leaf.setViewState({
				type: "empty",
			});
		}
	}
	
	console.log('[Canvas Plugin] Closed', closedLeaves.length, 'canvas views');
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


