/**
 * IDAllocator — schema-driven per-type ID allocation + collision repair. (§12)
 *
 * STUB: every method throws NOT_IMPLEMENTED. Driven to green by suite E:
 *   - per-type max+1 INCLUDING archived entities (parity #6).
 *   - duplicate detection + collision repair (reassign + rewrite refs).
 *   - padding ≥ 3; F- feature prefix.
 *
 * `getEntityTypeFromId` takes the schema (the §12 arity-bug fix) so prefixes are
 * schema-driven, not hardcoded.
 */

import {
  notImplemented,
  type EntityId,
  type EntityIndex,
  type EntityType,
  type FileSystem,
} from './types.js';
import type { SchemaRegistry } from './schema-registry.js';
import type { PathResolver } from './path-resolver.js';
import { parse as parseYaml } from 'yaml';

export class IDAllocator {
  constructor(
    private readonly schema: SchemaRegistry,
    private readonly index: EntityIndex
  ) {}

  /** Next free id for a type: per-type max+1 over ACTIVE and ARCHIVED ids. */
  async allocate(type: EntityType): Promise<EntityId> {
    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) {
      throw new Error(`Unknown entity type: ${type}`);
    }

    const prefix = typeDef.idPrefix;
    const padding = this.schema.getIdPadding();

    // Get all IDs including archived
    const allIds = this.index.getAllIds(true);

    // Filter to this type's IDs and extract the numeric part
    const numbers: number[] = [];
    for (const id of allIds) {
      if (id.startsWith(prefix + '-')) {
        const numPart = id.substring(prefix.length + 1);
        const num = parseInt(numPart, 10);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }
    }

    // Find max + 1
    const max = numbers.length > 0 ? Math.max(...numbers) : 0;
    const next = max + 1;

    // Format with padding
    const formatted = String(next).padStart(padding, '0');
    return `${prefix}-${formatted}`;
  }

  reserve(id: EntityId): void {
    this.index.reserveId(id);
  }

  validate(id: EntityId): boolean {
    const type = getEntityTypeFromId(id, this.schema);
    if (!type) return false;

    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) return false;

    // Check format: PREFIX-DIGITS
    const match = id.match(/^([A-Z]+)-(\d+)$/);
    if (!match) return false;

    const [, prefix, digits] = match;
    if (prefix !== typeDef.idPrefix) return false;

    const padding = this.schema.getIdPadding();
    if (digits.length < padding) return false;

    return true;
  }

  /**
   * Repair duplicate ids of last resort: keep the active entity's id, reassign
   * the other to the next free per-type id, rewrite all inbound references.
   * Returns the reassigned ids.
   */
  async repairDuplicates(
    fs: FileSystem,
    pathResolver: PathResolver
  ): Promise<EntityId[]> {
    const duplicates = this.index.findDuplicateIds();
    if (duplicates.length === 0) {
      return [];
    }

    const reassigned: EntityId[] = [];

    for (const { id, paths } of duplicates) {
      // Strategy: Keep the first non-archived file, reassign others
      let activeIndex = 0;
      for (let i = 0; i < paths.length; i++) {
        if (!paths[i].includes('archive/')) {
          activeIndex = i;
          break;
        }
      }

      const keepPath = paths[activeIndex];
      const reassignPaths = paths.filter((_, i) => i !== activeIndex);

      for (const path of reassignPaths) {
        try {
          // Read the file
          const content = await fs.readFile(path);

          // Extract entity type from ID
          const type = getEntityTypeFromId(id, this.schema);
          if (!type) continue;

          // Generate new ID
          const newId = await this.allocate(type);

          // Replace ID in frontmatter
          const updated = content.replace(
            /^id:\s*(.+)$/m,
            `id: ${newId}`
          );

          // Write back
          await fs.writeFile(path, updated);

          reassigned.push(newId);

          // Inbound-reference rewrite (§5.3): every relationship-field
          // occurrence of the old id follows the reassigned copy — in the
          // entity files and in the index relationship graph.
          await this.rewriteInboundReferences(fs, id, newId);
        } catch (error) {
          console.error(`Failed to repair duplicate ${id} at ${path}:`, error);
        }
      }
    }

    return reassigned;
  }

  /** Field names (forward + reverse) of every relationship in the schema. */
  private relationshipFieldNames(): Set<string> {
    const fields = new Set<string>();
    for (const rel of this.schema.getAllRelationships()) {
      for (const pair of rel.pairs) {
        fields.add(pair.forward);
        fields.add(pair.reverse);
      }
    }
    return fields;
  }

  /**
   * Rewrite every relationship-field reference to `oldId` across the vault:
   * textually in the frontmatter (scalar, block-list and inline-array shapes;
   * formatting preserved) and in the index relationship graph. Only schema
   * relationship fields are touched — id mentions in titles, vault_path or
   * body prose stay as-is. Candidate files come from the index.
   */
  private async rewriteInboundReferences(
    fs: FileSystem,
    oldId: EntityId,
    newId: EntityId
  ): Promise<void> {
    const relFields = this.relationshipFieldNames();

    const paths = new Set<string>();
    for (const entityId of this.index.getAllIds(true)) {
      const p = this.index.getPathById(entityId);
      if (p) paths.add(p);
    }
    // getPathById surfaces one path per id — add the collision set explicitly
    // so both copies of a duplicated id are swept.
    for (const group of this.index.findDuplicateIds()) {
      for (const p of group.paths) paths.add(p);
    }

    for (const path of paths) {
      let content: string;
      try {
        content = await fs.readFile(path);
      } catch {
        continue; // stale index entry — nothing to rewrite
      }
      const rewritten = rewriteRelationshipFields(content, relFields, oldId, newId);
      if (rewritten === null) continue;
      await fs.writeFile(path, rewritten);
      this.reindexRelationships(rewritten, relFields);
    }
  }

  /**
   * Refresh the index graph for a rewritten entity: drop its forward edges and
   * re-add them from the updated frontmatter (mirrors scanIndex). Guarded at
   * runtime because the test harness index only implements the read side of
   * the EntityIndex seam.
   */
  private reindexRelationships(content: string, relFields: Set<string>): void {
    if (
      typeof this.index.removeForwardRelationships !== 'function' ||
      typeof this.index.addRelationship !== 'function'
    ) {
      return;
    }
    const fm = parseFrontmatter(content);
    const entityId = fm?.id;
    if (typeof entityId !== 'string') return;

    this.index.removeForwardRelationships(entityId);
    for (const field of relFields) {
      const value = fm?.[field];
      if (value === undefined || value === null) continue;
      const targets = Array.isArray(value) ? value : [value];
      for (const target of targets) {
        if (typeof target === 'string') {
          this.index.addRelationship(entityId, field, target);
        }
      }
    }
  }
}

/** Parse the YAML frontmatter block, or null when absent/invalid. */
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const fm = parseYaml(match[1]);
    return fm && typeof fm === 'object' ? (fm as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `id` as a whole-token regex — never matches inside longer ids (S-035 ∉ S-0355). */
function idToken(id: string): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, 'g');
}

/**
 * Textually rewrite `oldId` → `newId` inside relationship-field VALUES of the
 * frontmatter block only: scalar (`field: ID`), inline array (`field: [ID, …]`)
 * and block-list items (`- ID`) under a relationship key. Everything else —
 * other fields, the `id:` line, the body — is untouched, so unaffected files
 * stay byte-identical. Returns null when nothing changed.
 */
function rewriteRelationshipFields(
  content: string,
  relFields: Set<string>,
  oldId: string,
  newId: string
): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?\r?\n)---/);
  if (!match) return null;
  const fmBlock = match[1];
  const token = idToken(oldId);

  let inRelField = false;
  let changed = false;
  const lines = fmBlock.split('\n').map((line) => {
    const key = line.match(/^([A-Za-z0-9_-]+):/);
    if (key) inRelField = relFields.has(key[1]);
    const isListItem = !key && /^\s*-\s/.test(line);
    if (!inRelField || (!key && !isListItem)) return line;

    // Only the value side of a key line is eligible (key names are id-free anyway).
    const value = key ? line.slice(key[0].length) : line;
    const next = value.replace(token, newId);
    if (next === value) return line;
    changed = true;
    return key ? key[0] + next : next;
  });
  if (!changed) return null;

  const openLen = match[0].length - fmBlock.length - 3; // length of the opening '---\n'
  return content.slice(0, openLen) + lines.join('\n') + content.slice(openLen + fmBlock.length);
}

/** Extract entity type from id prefix (schema-driven). */
export function getEntityTypeFromId(id: EntityId, schema: SchemaRegistry): EntityType | null {
  // Extract prefix from ID (e.g., "M-001" -> "M", "DEC-042" -> "DEC")
  const match = id.match(/^([A-Z]+)-/);
  if (!match) return null;

  const prefix = match[1];

  // Find entity type with matching prefix
  for (const type of schema.getAllEntityTypes()) {
    if (type.idPrefix === prefix) {
      return type.type;
    }
  }

  return null;
}
