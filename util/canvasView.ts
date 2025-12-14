import { App, TFile, View } from "obsidian";
import { CanvasNode } from "./canvas";

/**
 * Internal canvas view interface (not part of public Obsidian API)
 * Using unknown for canvas internals since they're not typed
 */
interface CanvasView extends View {
	file?: TFile;
	canvas?: {
		data?: { nodes: CanvasNode[] };
		createFileNode?: (opts: {
			pos: { x: number; y: number };
			size: { width: number; height: number };
			file: TFile;
			save: boolean;
			focus: boolean;
		}) => { setColor?: (color: string) => void } | undefined;
		requestSave?: () => void;
	};
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

