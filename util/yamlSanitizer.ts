/**
 * YAML Value Sanitization Utilities
 * 
 * Prevents YAML parsing errors by sanitizing problematic characters in frontmatter values.
 * 
 * PROBLEM: Colons in unquoted YAML values break Obsidian's YAML parser:
 *   title: Component 3: Config Loader  ❌ "Nested mappings are not allowed"
 * 
 * SOLUTION: Replace colons with safe alternatives:
 *   title: Component 3 - Config Loader  ✅ Works everywhere
 */

/**
 * Characters that cause YAML parsing issues in unquoted strings
 */
const YAML_UNSAFE_CHARS: Record<string, string> = {
	':': ' -',  // Colon → dash (most common issue)
	'#': '',    // Hash (comment marker)
	'@': '',    // At sign
	'`': '',    // Backtick
	'|': '-',   // Pipe
	'>': '',    // Greater than
	'[': '(',   // Opening bracket
	']': ')',   // Closing bracket
	'{': '(',   // Opening brace
	'}': ')',   // Closing brace
};

/**
 * Sanitize a string value for safe use in YAML frontmatter.
 * Replaces colons and other problematic characters with safe alternatives.
 * 
 * @param value - String value to sanitize
 * @returns Sanitized string safe for YAML
 * 
 * @example
 * sanitizeYamlValue("Component 3: Config Loader")
 * // Returns: "Component 3 - Config Loader"
 * 
 * sanitizeYamlValue("Phase 3.1: Integration Testing")
 * // Returns: "Phase 3.1 - Integration Testing"
 */
export function sanitizeYamlValue(value: string): string {
	if (!value || typeof value !== 'string') {
		return value;
	}

	let sanitized = value;

	// Replace unsafe characters
	for (const [unsafe, safe] of Object.entries(YAML_UNSAFE_CHARS)) {
		sanitized = sanitized.replace(new RegExp(escapeRegex(unsafe), 'g'), safe);
	}

	// Clean up multiple spaces and trim
	sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();

	return sanitized;
}

/**
 * Escape regex special characters in a string
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize all string fields in an object (recursive).
 * Used to sanitize entity properties before writing to YAML.
 * 
 * @param obj - Object to sanitize
 * @returns New object with sanitized string values
 */
export function sanitizeObjectForYaml<T extends Record<string, unknown>>(obj: T): T {
	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'string') {
			sanitized[key] = sanitizeYamlValue(value);
		} else if (Array.isArray(value)) {
			sanitized[key] = value.map(item =>
				typeof item === 'string' ? sanitizeYamlValue(item) : item
			);
		} else if (value && typeof value === 'object') {
			sanitized[key] = sanitizeObjectForYaml(value as Record<string, unknown>);
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized as T;
}

/**
 * Sanitize frontmatter fields that are known to cause issues.
 * Focuses on title and other common string fields.
 * 
 * @param frontmatter - Frontmatter object
 * @returns Sanitized frontmatter
 */
export function sanitizeFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
	const sanitized = { ...frontmatter };

	// String fields that commonly contain colons
	const stringFields = ['title', 'description', 'goal', 'context', 'rationale'];

	for (const field of stringFields) {
		if (typeof sanitized[field] === 'string') {
			sanitized[field] = sanitizeYamlValue(sanitized[field] as string);
		}
	}

	return sanitized;
}

/**
 * Check if a string value contains unsafe YAML characters
 * 
 * @param value - String to check
 * @returns true if value contains unsafe characters
 */
export function hasUnsafeYamlChars(value: string): boolean {
	if (!value || typeof value !== 'string') {
		return false;
	}

	return Object.keys(YAML_UNSAFE_CHARS).some(char => value.includes(char));
}

/**
 * Get a report of unsafe characters found in a value
 * 
 * @param value - String to analyze
 * @returns Array of unsafe characters found
 */
export function getUnsafeChars(value: string): string[] {
	if (!value || typeof value !== 'string') {
		return [];
	}

	return Object.keys(YAML_UNSAFE_CHARS).filter(char => value.includes(char));
}

