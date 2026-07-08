/**
 * PathResolver — schema-driven path/folder routing + filenames. (§6)
 *
 * STUB: every method throws NOT_IMPLEMENTED. Driven to green by suite F:
 *   - per-type folder routing (milestone → entities/milestones).
 *   - filename pattern ({id}_{title}).
 *   - single archive layout (by-type: archive/<type-folder>/).
 */

import {
  type EntityId,
  type EntityType,
  type VaultPath,
} from './types.js';
import type { SchemaRegistry } from './schema-registry.js';
import { getEntityTypeFromId } from './id-allocator.js';

/** Filename slug casing mode (see {@link sanitizeTitleForFilename}). */
export type FilenameCase = 'snake' | 'preserve';

/**
 * Canonical entity-title → filename slug. Single source of truth for filename
 * sanitization shared by the MCP path-resolver AND the plugin (util/fileNaming),
 * so both produce identical filenames for the same input.
 *
 * Modes:
 *   - 'snake'    (default): lowercase, `[^a-z0-9]+` → `_`, trim `_`.
 *                e.g. "Q1 Launch" → "q1_launch".
 *   - 'preserve'          : keep case + hyphens, replace runs of whitespace and
 *                filesystem-invalid chars (\/:*?"<>| + control) — and any other
 *                non `[A-Za-z0-9_-]` char — with `_`, collapse repeats, trim `_`.
 *                e.g. "Add 90-day retention policy" → "Add_90-day_retention_policy".
 */
export function sanitizeTitleForFilename(
  title: string,
  mode: FilenameCase = 'snake'
): string {
  if (mode === 'preserve') {
    return title
      .replace(/[^A-Za-z0-9_-]+/g, '_') // whitespace / invalid / other → _
      .replace(/_+/g, '_') // collapse repeated underscores
      .replace(/^_+|_+$/g, ''); // trim leading/trailing underscores
  }
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}

/**
 * Shared filename builder — the single place that turns (id, title) into a
 * `<pattern>.md` filename. Used by both the MCP PathResolver and the plugin's
 * util/fileNaming, so the two always agree.
 */
export function buildEntityFilename(
  id: EntityId,
  title: string,
  pattern: string,
  mode: FilenameCase = 'snake'
): string {
  return (
    pattern
      .replace('{id}', id)
      .replace('{title}', sanitizeTitleForFilename(title, mode)) + '.md'
  );
}

/** Join path segments, dropping empty ones so an empty prefix yields no leading slash. */
function joinPath(...segments: string[]): string {
  return segments.filter((s) => s !== '' && s != null).join('/');
}

export interface PathResolverConfig {
  vaultPath: string;
  entitiesFolder: string; // e.g. "entities"
  archiveFolder: string; // e.g. "archive"
  canvasFolder: string; // e.g. "projects"
}

export class PathResolver {
  constructor(
    private readonly schema: SchemaRegistry,
    private readonly config: PathResolverConfig
  ) {}

  getTypeFolderPath(type: EntityType): VaultPath {
    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) {
      throw new Error(`Unknown entity type: ${type}`);
    }
    return joinPath(this.config.entitiesFolder, typeDef.folder);
  }

  getEntityPath(id: EntityId, title: string): VaultPath {
    const type = this.getTypeFromId(id);
    const folder = this.getTypeFolderPath(type);
    const filename = this.generateFilename(id, title);
    return `${folder}/${filename}`;
  }

  generateFilename(id: EntityId, title: string): string {
    return buildEntityFilename(
      id,
      title,
      this.schema.getFilenamePattern(),
      this.schema.getFilenameCase()
    );
  }

  getArchiveFolderPath(id: EntityId): VaultPath {
    const type = this.getTypeFromId(id);
    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) {
      throw new Error(`Unknown entity type: ${type}`);
    }
    return joinPath(this.config.archiveFolder, typeDef.folder);
  }

  getArchivePath(id: EntityId, title: string): VaultPath {
    const folder = this.getArchiveFolderPath(id);
    const filename = this.generateFilename(id, title);
    return `${folder}/${filename}`;
  }

  getCanvasFolderPath(): VaultPath {
    return this.config.canvasFolder;
  }

  extractIdFromPath(filePath: VaultPath): EntityId | null {
    // Extract ID from pattern like "entities/stories/S-001_title.md"
    const match = filePath.match(/([A-Z]+-\d+)/);
    return match ? match[1] : null;
  }

  getTypeFromPath(filePath: VaultPath): EntityType | null {
    const id = this.extractIdFromPath(filePath);
    if (!id) return null;
    return this.getTypeFromId(id);
  }

  isArchivePath(filePath: VaultPath): boolean {
    return filePath.startsWith(`${this.config.archiveFolder}/`);
  }

  isEntityPath(filePath: VaultPath): boolean {
    if (this.isArchivePath(filePath)) return false;
    // Bare-folder layout (empty prefix): any non-archive vault path is an entity path.
    if (!this.config.entitiesFolder) return true;
    return filePath.startsWith(`${this.config.entitiesFolder}/`);
  }

  private getTypeFromId(id: EntityId): EntityType {
    const type = getEntityTypeFromId(id, this.schema);
    if (!type) {
      throw new Error(`Cannot determine type from id: ${id}`);
    }
    return type;
  }

  toVaultPath(absolutePath: string): VaultPath {
    // Remove vault prefix to get vault-relative path
    const prefix = this.config.vaultPath + '/';
    if (absolutePath.startsWith(prefix)) {
      return absolutePath.substring(prefix.length);
    }
    // If path doesn't start with vault prefix, assume it's already relative
    return absolutePath.startsWith('/') ? absolutePath.substring(1) : absolutePath;
  }

  toAbsolutePath(vaultPath: VaultPath): string {
    // Combine vault path with relative path
    const cleaned = vaultPath.startsWith('/') ? vaultPath.substring(1) : vaultPath;
    return `${this.config.vaultPath}/${cleaned}`;
  }
}
