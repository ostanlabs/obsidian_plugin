/**
 * Relationship field sanitization utilities for the Obsidian plugin.
 *
 * Ensures entity IDs in relationship fields are stored without quotes,
 * fixing issues where quoted IDs (e.g., "M-001" or 'S-042') break
 * relationship detection and graph building.
 */

import { DEFAULT_SCHEMA } from "../src/entity-core/default-schema.js";
import { getAllRelationshipFieldNames } from "../src/entity-core/schema-derivation.js";

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
 * Deprecated relationship fields that are no longer in the schema but may
 * still exist in old vault files (the `enables`/`enabled_by` pair predates
 * the depends_on↔blocks correction). Sanitization must keep cleaning them so
 * legacy frontmatter doesn't retain quoted IDs, even though no current code
 * writes these fields.
 */
export const LEGACY_RELATIONSHIP_FIELDS = ["enables", "enabled_by"] as const;

/**
 * All known relationship field names: every forward+reverse field across the
 * schema's relationships (schema-derivation.getAllRelationshipFieldNames),
 * plus the explicit legacy fields above.
 */
export const RELATIONSHIP_FIELDS: string[] = [
	...getAllRelationshipFieldNames(DEFAULT_SCHEMA),
	...LEGACY_RELATIONSHIP_FIELDS,
];

/**
 * Sanitize all relationship fields in a frontmatter object.
 *
 * Processes all schema relationship field names (forward + reverse, e.g.
 * parent/children, depends_on/blocks, implements/implemented_by,
 * documents/documented_by, affects/decided_by, supersedes/superseded_by,
 * previous_version/next_version) plus the legacy enables/enabled_by pair,
 * and strips quotes from their values.
 *
 * @param frontmatter - Frontmatter object to sanitize (modified in place)
 * @returns The same frontmatter object with sanitized relationships
 */
export function sanitizeAllRelationships(
	frontmatter: Record<string, unknown>
): Record<string, unknown> {
	for (const field of RELATIONSHIP_FIELDS) {
		if (field in frontmatter) {
			frontmatter[field] = sanitizeRelationshipValue(
				frontmatter[field] as string | string[] | null | undefined
			);
		}
	}

	return frontmatter;
}

