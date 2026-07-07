/**
 * Pure feature-roadmap parsing / similarity helpers. Extracted from main.ts (Phase 5).
 * No obsidian dependency.
 */
import type { FeaturePhase } from "../types";

export interface ParsedFutureFeature {
	title: string;
	description?: string;
	category?: string;
	status?: string;
}

/** Parse a roadmap-style markdown document into a flat list of feature items. */
export function parseFutureFeatures(content: string): ParsedFutureFeature[] {
	const features: ParsedFutureFeature[] = [];

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

/** Map a free-text category label to a feature phase. */
export function mapCategoryToPhase(category: string): FeaturePhase {
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

/** Word-overlap similarity of two titles in [0,1] (words ≤2 chars ignored). */
export function titleSimilarity(a: string, b: string): number {
	const aWords = new Set(a.toLowerCase().split(/\s+/));
	const bWords = new Set(b.toLowerCase().split(/\s+/));
	let matches = 0;
	for (const word of aWords) {
		if (word.length > 2 && bWords.has(word)) matches++;
	}
	return matches / Math.max(aWords.size, bWords.size);
}
