import type { EntityType } from "../types";
import type { CanvasNode } from "./canvas";

/**
 * Options for building canvas metadata.
 */
export interface BuildCanvasMetadataOptions {
	/** Display alias; defaults to the entity title when omitted. */
	alias?: string;
	/** Whether the entity ID should be shown in the canvas node. */
	showId: boolean;
	/** Resolved effort color; applied only when truthy. */
	effortColor?: string;
}

/**
 * Build the canvas metadata payload for a structured note.
 *
 * Pure and obsidian-free: all runtime inputs (alias, showId, effortColor) are
 * passed in explicitly rather than read from plugin settings/state.
 */
export function buildCanvasMetadata(
	type: EntityType,
	title: string,
	opts: BuildCanvasMetadataOptions
): CanvasNode["metadata"] {
	const metadata: CanvasNode["metadata"] = {
		plugin: "canvas-project-manager",
		alias: opts.alias ?? title,
		shape: "entity",
		showId: opts.showId,
	};

	if (opts.effortColor) {
		metadata.effortColor = opts.effortColor;
	}

	return metadata;
}
