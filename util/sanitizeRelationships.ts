/**
 * Relationship field sanitization utilities for the Obsidian plugin.
 *
 * Ensures entity IDs in relationship fields are stored without quotes,
 * fixing issues where quoted IDs (e.g., "M-001" or 'S-042') break
 * relationship detection and graph building.
 */

/**
 * Strip quotes from a single entity ID string.
 * Handles both double quotes ("M-001") and single quotes ('M-001').
 *
 * @param value - Raw value that might contain quotes
 * @returns Unquoted string
 *
 * @example
 * stripQuotes('"M-001"') // 'M-001'
 * stripQuotes("'S-042'") // 'S-042'
 * stripQuotes('T-123')   // 'T-123' (unchanged)
 */
export function stripQuotes(value: string): string {
	if (typeof value !== "string") {
		return value;
	}

	const trimmed = value.trim();

	// Strip double quotes
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		return trimmed.slice(1, -1);
	}

	// Strip single quotes
	if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

/**
 * Sanitize a relationship field value by stripping quotes from entity IDs.
 *
 * Handles:
 * - Single entity ID strings: "M-001" → M-001
 * - Arrays of entity IDs: ["M-001", "S-042"] → [M-001, S-042]
 * - Mixed quoted/unquoted arrays: ["M-001", S-042] → [M-001, S-042]
 * - Null/undefined values: preserved as-is
 *
 * @param value - Relationship field value (string, string[], null, undefined)
 * @returns Sanitized value with quotes stripped
 */
export function sanitizeRelationshipValue(
	value: string | string[] | null | undefined
): string | string[] | null | undefined {
	if (value === null || value === undefined) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map(stripQuotes);
	}

	if (typeof value === "string") {
		return stripQuotes(value);
	}

	// Unexpected type - return as-is
	return value;
}

/**
 * Sanitize all relationship fields in a frontmatter object.
 *
 * Processes common relationship field names and strips quotes from their values:
 * - parent, depends_on, blocks, enables, affects
 * - implements, implemented_by
 * - supersedes, superseded_by
 * - documents, documented_by
 * - affects, decided_by
 * - previous_version
 *
 * @param frontmatter - Frontmatter object to sanitize (modified in place)
 * @returns The same frontmatter object with sanitized relationships
 */
export function sanitizeAllRelationships(
	frontmatter: Record<string, unknown>
): Record<string, unknown> {
	// List of all known relationship fields
	const relationshipFields = [
		"parent",
		"depends_on",
		"blocks",
		"enables",
		"affects",
		"implements",
		"implemented_by",
		"supersedes",
		"superseded_by",
		"documents",
		"documented_by",
		"decided_by",
		"previous_version",
		"children",
		"enabled_by",
	];

	for (const field of relationshipFields) {
		if (field in frontmatter) {
			frontmatter[field] = sanitizeRelationshipValue(
				frontmatter[field] as string | string[] | null | undefined
			);
		}
	}

	return frontmatter;
}

