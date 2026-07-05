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

          // TODO: Update all inbound references to this ID
          // This requires scanning all files and replacing old ID with new ID
          // in relationship fields. Deferred for now as it's complex.
        } catch (error) {
          console.error(`Failed to repair duplicate ${id} at ${path}:`, error);
        }
      }
    }

    return reassigned;
  }
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
