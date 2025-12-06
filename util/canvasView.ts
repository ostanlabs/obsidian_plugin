import { App, TFile, WorkspaceLeaf } from "obsidian";
import { CanvasData, CanvasNode } from "./canvas";

/**
 * Directly add a node to an open canvas view without touching the file
 * This updates the in-memory canvas data and triggers a save
 */
export async function addNodeToCanvasView(
	app: App,
	canvasFile: TFile,
	node: CanvasNode
): Promise<boolean> {
	const leaves = app.workspace.getLeavesOfType("canvas");
	
	for (const leaf of leaves) {
		const view = leaf.view as any;
		if (view.file?.path === canvasFile.path) {
			try {
				console.log('[Canvas Plugin] Found open canvas view, adding node directly');
				
				// Get the actual TFile object for the note
				const noteFile = app.vault.getAbstractFileByPath(node.file!);
				if (!(noteFile instanceof TFile)) {
					console.error('[Canvas Plugin] Note file not found:', node.file);
					return false;
				}
				
				// Access the canvas's internal data
				if (view.canvas && view.canvas.data) {
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
						
						if (node.color && visualNode && visualNode.setColor) {
							visualNode.setColor(node.color);
						}
						
						console.log('[Canvas Plugin] Visual node created successfully');
					}
					
					// Mark canvas as dirty and request save
					if (view.canvas.requestSave) {
						view.canvas.requestSave();
					}
					
					console.log('[Canvas Plugin] Node added directly to canvas view');
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
		const view = leaf.view as any;
		return view.file?.path === canvasFile.path;
	});
}

