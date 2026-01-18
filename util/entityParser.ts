/**
 * Entity Parser Utility
 * 
 * Parses MD files and extracts EntityData for the positioning engine.
 * This is the canonical parsing logic used by both the plugin and tests.
 */

import { EntityData, EntityType } from './positioningV4';

/**
 * Strip quotes from a YAML value
 */
export function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/**
 * Parse a YAML array from frontmatter text
 * Supports both multiline (- item) and inline ([item1, item2]) formats
 */
export function parseYamlArray(text: string, key: string): string[] {
	// Try multiline format first: key:\n  - item1\n  - item2
	const multilineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-[ \\t]*.+\\n?)+)`, 'm'));
	if (multilineMatch) {
		const items = multilineMatch[1].match(/^[ \t]*-[ \t]*(.+)$/gm);
		if (items) {
			return items.map(item => stripQuotes(item.replace(/^[ \t]*-[ \t]*/, '')));
		}
	}

	// Try inline array format: key: [item1, item2]
	const inlineMatch = text.match(new RegExp(`^${key}:[ \\t]*\\[([^\\]]+)\\]`, 'm'));
	if (inlineMatch) {
		return inlineMatch[1].split(',').map(s => stripQuotes(s));
	}

	// Try single value format: key: value
	const singleMatch = text.match(new RegExp(`^${key}:[ \\t]*([^\\n\\[]+)$`, 'm'));
	if (singleMatch && singleMatch[1].trim()) {
		return [stripQuotes(singleMatch[1])];
	}

	return [];
}

/**
 * Parse a single YAML value from frontmatter text
 */
export function parseYamlValue(text: string, key: string): string | undefined {
	const match = text.match(new RegExp(`^${key}:[ \\t]*(.+)$`, 'm'));
	if (match && match[1].trim()) {
		return stripQuotes(match[1]);
	}
	return undefined;
}

/**
 * Valid entity types for the positioning engine
 */
export const VALID_ENTITY_TYPES: EntityType[] = ['milestone', 'story', 'task', 'decision', 'document', 'feature'];

/**
 * Parse frontmatter text and extract EntityData
 * 
 * @param frontmatterText - The raw frontmatter text (without --- delimiters)
 * @param nodeId - The canvas node ID
 * @param filePath - The file path for the entity
 * @returns EntityData or null if parsing fails
 */
export function parseEntityFromFrontmatter(
	frontmatterText: string,
	nodeId: string,
	filePath: string
): EntityData | null {
	const typeStr = parseYamlValue(frontmatterText, 'type')?.toLowerCase() || 'unknown';
	const entityId = parseYamlValue(frontmatterText, 'id');

	if (!entityId) {
		return null;
	}

	// Map type string to EntityType
	const entityType: EntityType = VALID_ENTITY_TYPES.includes(typeStr as EntityType)
		? typeStr as EntityType
		: 'task'; // Default unknown types to task

	return {
		entityId,
		nodeId,
		type: entityType,
		workstream: parseYamlValue(frontmatterText, 'workstream')?.toLowerCase() || 'unassigned',
		parent: parseYamlValue(frontmatterText, 'parent'),
		dependsOn: parseYamlArray(frontmatterText, 'depends_on'),
		blocks: parseYamlArray(frontmatterText, 'blocks'),
		enables: parseYamlArray(frontmatterText, 'enables'),
		affects: parseYamlArray(frontmatterText, 'affects'),
		implementedBy: parseYamlArray(frontmatterText, 'implemented_by'),
		implements: parseYamlArray(frontmatterText, 'implements'),
		documents: parseYamlValue(frontmatterText, 'documents'),
		supersedes: parseYamlValue(frontmatterText, 'supersedes'),
		previousVersion: parseYamlValue(frontmatterText, 'previous_version'),
		filePath,
	};
}

/**
 * Parse a full MD file content and extract EntityData
 * 
 * @param content - The full MD file content (including frontmatter)
 * @param nodeId - The canvas node ID
 * @param filePath - The file path for the entity
 * @returns EntityData or null if parsing fails
 */
export function parseEntityFromContent(
	content: string,
	nodeId: string,
	filePath: string
): EntityData | null {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) {
		return null;
	}

	return parseEntityFromFrontmatter(fmMatch[1], nodeId, filePath);
}

/**
 * Generate a node ID from an entity ID (for testing purposes)
 */
export function generateNodeIdFromEntityId(entityId: string): string {
	return `node-${entityId}`;
}

