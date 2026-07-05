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
    return `${this.config.entitiesFolder}/${typeDef.folder}`;
  }

  getEntityPath(id: EntityId, title: string): VaultPath {
    const type = this.getTypeFromId(id);
    const folder = this.getTypeFolderPath(type);
    const filename = this.generateFilename(id, title);
    return `${folder}/${filename}`;
  }

  generateFilename(id: EntityId, title: string): string {
    const pattern = this.schema.getFilenamePattern();
    const sanitizedTitle = this.sanitizeForFilename(title);

    // Simple pattern substitution
    return pattern
      .replace('{id}', id)
      .replace('{title}', sanitizedTitle)
      + '.md';
  }

  getArchiveFolderPath(id: EntityId): VaultPath {
    const type = this.getTypeFromId(id);
    const typeDef = this.schema.getEntityType(type);
    if (!typeDef) {
      throw new Error(`Unknown entity type: ${type}`);
    }
    return `${this.config.archiveFolder}/${typeDef.folder}`;
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
    return filePath.startsWith(`${this.config.entitiesFolder}/`);
  }

  private getTypeFromId(id: EntityId): EntityType {
    const type = getEntityTypeFromId(id, this.schema);
    if (!type) {
      throw new Error(`Cannot determine type from id: ${id}`);
    }
    return type;
  }

  private sanitizeForFilename(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
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
