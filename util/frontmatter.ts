import { App, TFile } from "obsidian";
import YAML from "yaml";
import { ItemFrontmatter, FeatureFrontmatter } from "../types";
import { sanitizeAllRelationships } from "./sanitizeRelationships";

/**
 * Parsed frontmatter with string index signature for dynamic access
 */
type ParsedFrontmatter = Record<string, string | string[] | boolean | number | undefined>;

/**
 * Generic frontmatter type that can be either ItemFrontmatter or FeatureFrontmatter
 */
export type GenericFrontmatter = ItemFrontmatter | FeatureFrontmatter;

/**
 * Canonical YAML serialization options.
 *
 * These MUST stay byte-identical to entity-core's `EntitySerializer`
 * (src/entity-core/serializer.ts) so that plugin-written and MCP-written entity
 * files are indistinguishable:
 *   - quote-when-needed scalars        (defaultStringType: 'PLAIN')
 *   - arrays are YAML block sequences  (- item)
 *   - lines are never wrapped          (lineWidth: 0)
 *   - keys stay plain/unquoted         (defaultKeyType: 'PLAIN')
 *
 * This is what removes the old `yamlSanitizer` / `sanitizeRelationships` bug
 * class: the YAML writer auto-quotes only the values that need it (colons →
 * `title: "Component 3: Config Loader"`), so the plugin never emits YAML that its
 * own reader can't parse, while simple values stay readable/unquoted.
 */
const YAML_STRINGIFY_OPTS = {
	lineWidth: 0,
	defaultStringType: "PLAIN",
	defaultKeyType: "PLAIN",
} as const;

/**
 * Serialize a plain frontmatter object into a `---`-delimited YAML block in the
 * canonical EntitySerializer format. `undefined`/`null` values are dropped
 * (matching EntitySerializer, which only emits defined fields). The returned
 * block ends with a trailing newline after the closing `---`.
 */
function serializeFrontmatterBlock(frontmatter: Record<string, unknown>): string {
	const clean: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(frontmatter)) {
		if (value === undefined || value === null) continue;
		clean[key] = value;
	}
	const yaml = YAML.stringify(clean, YAML_STRINGIFY_OPTS as YAML.ToStringOptions);
	return `---\n${yaml}---\n`;
}

/**
 * Parse a YAML value that might be a JSON array
 * e.g., '["ACC-001", "ACC-002"]' -> ["ACC-001", "ACC-002"]
 * Also handles YAML-style arrays: '[T-108]' or '[T-106, T-107]'
 */
function parseYamlValue(value: string): string | string[] | boolean | number {
	const trimmed = value.trim();

	// Try to parse as JSON array first
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				return parsed;
			}
		} catch {
			// Not valid JSON - try parsing as YAML-style array (unquoted values)
			// e.g., [T-108] or [T-106, T-107]
			const inner = trimmed.slice(1, -1).trim();
			if (inner === '') {
				return []; // Empty array
			}
			// Split by comma and trim each value
			const items = inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => s.length > 0);
			return items;
		}
	}

	// Handle double-quoted strings, unescaping YAML escapes (\" and \\) so a value
	// written by YAML.stringify (e.g. a title containing a quote) round-trips.
	if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
		return unescapeDoubleQuoted(trimmed.slice(1, -1));
	}
	// Handle single-quoted strings (YAML escapes '' -> ').
	if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
		return trimmed.slice(1, -1).replace(/''/g, "'");
	}

	// Handle booleans
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;

	// Handle numbers
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		return parseFloat(trimmed);
	}

	return trimmed;
}

/**
 * Unescape the body of a YAML double-quoted scalar. Handles the escapes our
 * writer (YAML.stringify) actually emits: \" \\ \n \t \r \0.
 */
function unescapeDoubleQuoted(s: string): string {
	return s.replace(/\\(["\\ntr0])/g, (_m, ch) => {
		switch (ch) {
			case "n": return "\n";
			case "t": return "\t";
			case "r": return "\r";
			case "0": return "\0";
			default: return ch; // " or \
		}
	});
}

/**
 * Strip a single layer of surrounding quotes from a block-sequence item,
 * unescaping YAML double-quote escapes so the item round-trips.
 */
function stripQuotes(raw: string): string {
	const t = raw.trim();
	if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
		return unescapeDoubleQuoted(t.slice(1, -1));
	}
	if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
		return t.slice(1, -1).replace(/''/g, "'");
	}
	return t;
}

/**
 * Lenient, line-based frontmatter-body parser.
 *
 * Understands BOTH the legacy inline format (`depends_on: ["T-1"]`,
 * unquoted-colon titles) and the new canonical block format:
 *
 *   depends_on:
 *     - "T-002"
 *     - "S-1"
 *
 * It splits scalars on the FIRST colon (so legacy unquoted-colon values survive
 * where a strict YAML parser would throw) while still collecting block sequences.
 *
 * @param parseValues when true, scalar values are coerced via parseYamlValue
 *   (arrays/booleans/numbers/unquoted); when false they are kept as raw strings.
 */
function parseFrontmatterLines(
	frontmatterText: string,
	parseValues: boolean
): ParsedFrontmatter {
	const lines = frontmatterText.split("\n");
	const frontmatter: ParsedFrontmatter = {};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		if (!key) continue;

		const rest = line.slice(colonIndex + 1).trim();

		// Block sequence: `key:` followed by one or more `  - item` lines.
		if (rest === "" && /^[ \t]*-[ \t]*/.test(lines[i + 1] ?? "")) {
			const items: string[] = [];
			while (i + 1 < lines.length && /^[ \t]*-[ \t]*/.test(lines[i + 1])) {
				const itemRaw = lines[++i].replace(/^[ \t]*-[ \t]*/, "");
				items.push(stripQuotes(itemRaw));
			}
			frontmatter[key] = items;
			continue;
		}

		frontmatter[key] = parseValues ? parseYamlValue(rest) : rest;
	}

	return frontmatter;
}

/**
 * Robustly split a markdown document into a frontmatter object + body.
 *
 * Prefers a strict `YAML.parse` (correct for the new canonical format and for
 * well-formed legacy files) and falls back to the lenient line parser only when
 * strict parsing throws (e.g. legacy files with unquoted colons in a value).
 * Used by the write paths so a merge never loses/mangles existing fields.
 */
function robustSplitFrontmatter(content: string): {
	frontmatter: Record<string, unknown>;
	body: string;
} {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const frontmatterText = match[1];
	const body = content.substring(match[0].length);

	try {
		const parsed = YAML.parse(frontmatterText);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return { frontmatter: parsed as Record<string, unknown>, body };
		}
	} catch {
		// fall through to lenient parser
	}

	return { frontmatter: parseFrontmatterLines(frontmatterText, true), body };
}

/**
 * Parse raw frontmatter from a markdown file (returns ParsedFrontmatter)
 */
export function parseRawFrontmatter(content: string): ParsedFrontmatter | null {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(frontmatterRegex);

	if (!match) return null;

	const frontmatter = parseFrontmatterLines(match[1], true);

	// Convert boolean strings to actual booleans
	if (frontmatter.inProgress !== undefined && typeof frontmatter.inProgress === 'string') {
		frontmatter.inProgress = frontmatter.inProgress === "true";
	}
	if (frontmatter.created_by_plugin !== undefined && typeof frontmatter.created_by_plugin === 'string') {
		frontmatter.created_by_plugin = frontmatter.created_by_plugin === "true";
	}

	// Ensure array fields are always arrays if present
	const arrayFields = ['depends_on', 'blocks', 'implemented_by', 'documented_by', 'decided_by', 'personas', 'acceptance_criteria', 'test_refs'];
	for (const field of arrayFields) {
		if (frontmatter[field] !== undefined) {
			if (typeof frontmatter[field] === 'string') {
				const strVal = frontmatter[field] as string;
				frontmatter[field] = strVal ? [strVal] : [];
			} else if (!Array.isArray(frontmatter[field])) {
				frontmatter[field] = [];
			}
		}
	}

	return frontmatter;
}

/**
 * Parse frontmatter from a markdown file (for standard entities)
 */
export function parseFrontmatter(content: string): ItemFrontmatter | null {
	const frontmatter = parseRawFrontmatter(content);
	if (!frontmatter) return null;

	// Auto-migrate legacy fields (WI-1 migration: auto-migrate on read)
	if (frontmatter.created && !frontmatter.created_at) {
		frontmatter.created_at = frontmatter.created;
	}
	if (frontmatter.updated && !frontmatter.updated_at) {
		frontmatter.updated_at = frontmatter.updated;
	}
	if (frontmatter.effort && !frontmatter.workstream) {
		frontmatter.workstream = frontmatter.effort;
	}

	// Validate required fields for standard entities
	// Note: workstream is optional (defaults to 'default' in MCP spec)
	if (
		!frontmatter.type ||
		!frontmatter.title ||
		!frontmatter.id
	) {
		return null;
	}

	return frontmatter as unknown as ItemFrontmatter;
}

/**
 * Parse frontmatter for any entity type (feature or standard)
 * Returns the raw parsed frontmatter with type field
 */
export function parseAnyFrontmatter(content: string): ParsedFrontmatter | null {
	const frontmatter = parseRawFrontmatter(content);
	if (!frontmatter) return null;

	// Validate minimal required fields
	if (!frontmatter.type || !frontmatter.title || !frontmatter.id) {
		return null;
	}

	// Sanitize relationship fields to remove quotes from entity IDs
	sanitizeAllRelationships(frontmatter);

	return frontmatter;
}

/**
 * Parse frontmatter and body from a markdown file
 * Returns both frontmatter and body content separately
 */
export function parseFrontmatterAndBody(content: string): {
	frontmatter: ParsedFrontmatter;
	body: string;
} {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return {
			frontmatter: {},
			body: content,
		};
	}

	// Keep scalar values as raw strings (legacy behaviour) but understand block
	// sequences so the new canonical array format survives a read.
	const frontmatter = parseFrontmatterLines(match[1], false);
	const body = content.substring(match[0].length);

	return {
		frontmatter,
		body,
	};
}

/**
 * Update frontmatter in a markdown file
 * @param content Full markdown content including frontmatter
 * @param updates Partial frontmatter updates (supports both ItemFrontmatter and FeatureFrontmatter fields)
 * @returns Updated markdown content
 *
 * Output is written in the canonical EntitySerializer format (double-quoted
 * scalars, block-sequence arrays). The markdown body after the frontmatter is
 * preserved verbatim.
 */
export function updateFrontmatter(
	content: string,
	updates: Partial<ItemFrontmatter> | Partial<FeatureFrontmatter> | ParsedFrontmatter
): string {
	const { frontmatter: existingFrontmatter, body } = robustSplitFrontmatter(content);

	// Merge updates; undefined/null are dropped by serializeFrontmatterBlock.
	const mergedFrontmatter: Record<string, unknown> = { ...existingFrontmatter, ...updates };

	return serializeFrontmatterBlock(mergedFrontmatter) + body;
}

/**
 * Create content with frontmatter from body only
 * @param body Markdown body without frontmatter
 * @param frontmatter Frontmatter object
 * @returns Full markdown content with frontmatter
 *
 * Output uses the canonical EntitySerializer format. Certain fields
 * (`parent`, `notion_page_id`, `created_by_plugin`, `depends_on`) are always
 * emitted even when empty, preserving the plugin's long-standing contract.
 */
export function createWithFrontmatter(body: string, frontmatter: Partial<ItemFrontmatter>): string {
	// Fields that must appear in the block even when empty/undefined.
	const alwaysInclude = ['parent', 'notion_page_id', 'created_by_plugin', 'depends_on'];

	const out: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(frontmatter)) {
		if (Array.isArray(value)) {
			// Arrays (like depends_on) are always included, even if empty.
			out[key] = value;
		} else if (alwaysInclude.includes(key)) {
			// Always include, even when empty — emit "" so the key is present.
			out[key] = value === undefined || value === null ? "" : value;
		} else if (value !== undefined && value !== null && value !== "") {
			out[key] = value;
		}
	}

	// Guarantee the always-include fields exist even if absent from the input.
	for (const key of alwaysInclude) {
		if (!(key in out)) {
			out[key] = key === 'depends_on' ? [] : "";
		}
	}

	return serializeFrontmatterBlock(out) + body;
}

/**
 * Apply frontmatter updates to a file, writing in the canonical
 * EntitySerializer format (double-quoted scalars, block-sequence arrays).
 *
 * This is a read → merge-frontmatter → write round-trip on the SAME file, so
 * the markdown body and any fields not mentioned in `updates` are preserved.
 * Unlike Obsidian's `processFrontMatter` (which serializes via Obsidian's own
 * writer — inline arrays, unquoted scalars) this gives us full control over the
 * on-disk format so plugin-written files stay byte-consistent with MCP.
 *
 * @param app Obsidian App instance
 * @param file TFile to update
 * @param updates Fields to set/update. Pass null, undefined, or "" for a field to delete it.
 */
export async function applyFrontmatterUpdates(
	app: App,
	file: TFile,
	updates: Record<string, unknown>
): Promise<void> {
	// Sanitize relationship fields before writing to ensure entity IDs are never quoted
	const sanitizedUpdates = { ...updates };
	sanitizeAllRelationships(sanitizedUpdates);

	const content = await app.vault.read(file);
	const { frontmatter, body } = robustSplitFrontmatter(content);

	for (const [key, value] of Object.entries(sanitizedUpdates)) {
		if (value === undefined || value === null || value === "") {
			delete frontmatter[key];
		} else {
			frontmatter[key] = value;
		}
	}

	const newContent = serializeFrontmatterBlock(frontmatter) + body;
	await app.vault.modify(file, newContent);
}

/**
 * Serialize a standard entity's frontmatter to a canonical YAML block string.
 *
 * Field order matches entity-core's EntitySerializer / MCP conventions, and the
 * scalar quoting + block-array format is identical. Returns the `---`-delimited
 * block (no body).
 */
export function serializeFrontmatter(frontmatter: ItemFrontmatter): string {
	// MCP v2 spec: use workstream / created_at / updated_at (with legacy fallback)
	const workstream = frontmatter.workstream ?? frontmatter.effort ?? 'default';
	const created_at = frontmatter.created_at ?? frontmatter.created ?? '';
	const updated_at = frontmatter.updated_at ?? frontmatter.updated ?? '';

	const ordered: Record<string, unknown> = {
		type: frontmatter.type,
		title: frontmatter.title,
		id: frontmatter.id,
		workstream,
		status: frontmatter.status,
		priority: frontmatter.priority,
		inProgress: frontmatter.inProgress ?? false,
		created_by_plugin: frontmatter.created_by_plugin ?? true,
		created_at,
		updated_at,
		canvas_source: frontmatter.canvas_source,
		vault_path: frontmatter.vault_path,
		depends_on: frontmatter.depends_on || [],
		// Always emit notion_page_id (empty string when unset).
		notion_page_id: frontmatter.notion_page_id ?? "",
	};

	// serializeFrontmatterBlock appends a trailing newline; historical callers of
	// serializeFrontmatter expect just the block, so trim the trailing newline.
	return serializeFrontmatterBlock(ordered).replace(/\n$/, "");
}
