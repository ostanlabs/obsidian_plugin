import { ItemStatus, ItemPriority, DecisionStatus, DocumentStatus } from "../types";

/**
 * Normalize status values to v2.1 human-readable set
 * WI-1: Type-aware status normalization for Decision/Document entities
 *
 * Pure function extracted from main.ts (Phase 5). Behavior must remain identical.
 */
export function normalizeStatus(
	status?: string,
	entityType?: string
): ItemStatus | DecisionStatus | DocumentStatus {
	if (!status) {
		// Default status depends on entity type
		if (entityType === 'decision') return "Pending";
		if (entityType === 'document') return "Draft";
		return "Not Started";
	}

	const trimmed = status.trim();
	const lower = trimmed.toLowerCase();

	// Decision-specific statuses (preserve MCP v2 spec values)
	if (entityType === 'decision') {
		const decisionAllowed: DecisionStatus[] = ["Pending", "Decided", "Superseded"];
		if (decisionAllowed.includes(trimmed as DecisionStatus)) {
			return trimmed as DecisionStatus;
		}
		// Map common variants
		if (lower === 'pending' || lower === 'open') return "Pending";
		if (lower === 'decided' || lower === 'approved' || lower === 'done') return "Decided";
		if (lower === 'superseded' || lower === 'deprecated') return "Superseded";
		return "Pending"; // Default for decisions
	}

	// Document-specific statuses (preserve MCP v2 spec values)
	if (entityType === 'document') {
		const documentAllowed: DocumentStatus[] = ["Draft", "Review", "Approved", "Superseded"];
		if (documentAllowed.includes(trimmed as DocumentStatus)) {
			return trimmed as DocumentStatus;
		}
		// Map common variants
		if (lower === 'draft') return "Draft";
		if (lower === 'review' || lower === 'in review') return "Review";
		if (lower === 'approved' || lower === 'done' || lower === 'published') return "Approved";
		if (lower === 'superseded' || lower === 'deprecated' || lower === 'obsolete') return "Superseded";
		return "Draft"; // Default for documents
	}

	// Standard task/milestone/story status mapping
	const map: Record<string, ItemStatus> = {
		todo: "Not Started",
		"not started": "Not Started",
		in_progress: "In Progress",
		"in progress": "In Progress",
		done: "Completed",
		completed: "Completed",
		blocked: "Blocked",
	};

	if (map[lower]) return map[lower];

	// If already a valid ItemStatus value, return as-is
	const allowed: ItemStatus[] = ["Not Started", "In Progress", "Completed", "Blocked"];
	if (allowed.includes(trimmed as ItemStatus)) {
		return trimmed as ItemStatus;
	}

	return "Not Started";
}

/**
 * Normalize priority values to v2.1 human-readable set
 *
 * Pure function extracted from main.ts (Phase 5). Behavior must remain identical.
 */
export function normalizePriority(priority?: string): ItemPriority {
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
