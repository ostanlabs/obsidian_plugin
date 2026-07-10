/**
 * SchemaMigrator — schema-version + data migration engine. (§11)
 *
 * STUB: migrate throws NOT_IMPLEMENTED. Driven to green by suite H — the
 * AgentPlatform v0→v1 acceptance migration (design §8 runbook). Over the drift
 * fixture it must: merge `updated`→`updated_at` (newer wins), `effort`→`workstream`,
 * fill missing status, remap invalid statuses (decision Accepted→Decided),
 * merge decision `blocks`→`affects`, convert deprecated `enables`→`blocks`,
 * reconcile every inverse, repair duplicate ids, consolidate the archive — with
 * ZERO relationship data loss — and be idempotent + dry-run-safe.
 */

import {
  notImplemented,
  type EntityId,
  type FileSystem,
  type ValidationError,
  type VaultPath,
} from './types.js';
import type { PathResolver } from './path-resolver.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { DEFAULT_SCHEMA } from './default-schema.js';
import { SchemaRegistry } from './schema-registry.js';
import { getEntityTypeFromId } from './id-allocator.js';

export interface MigrationChange {
  entityId: EntityId;
  path: VaultPath;
  /** e.g. 'merge-updated', 'effort-to-workstream', 'fill-status', 'status-remap',
   *  'blocks-to-affects', 'enables-to-blocks', 'reconcile-inverse', 'id-repair',
   *  'archive-move', 'drop-key'. */
  kind: string;
  detail?: string;
}

export interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  dryRun: boolean;
  /** Count of entity files modified (0 on a no-op / idempotent re-run). */
  entitiesModified: number;
  changes: MigrationChange[];
  /** Ids reassigned by collision repair. */
  duplicatesRepaired: EntityId[];
  errors: ValidationError[];
}

export interface MigrateOptions {
  targetVersion: number;
  dryRun?: boolean;
}

interface FileMetadata {
  path: string;
  id: EntityId;
  type: string;
  archived: boolean;
  content: string;
  frontmatter: Record<string, unknown>;
  newPath?: string; // Set if file needs to be moved (archive consolidation)
}

export class SchemaMigrator {
  private readonly schema: SchemaRegistry;

  constructor(
    private readonly fs: FileSystem,
    private readonly vaultPath: string,
    private readonly pathResolver?: PathResolver,
    schema?: SchemaRegistry
  ) {
    // Injected by the facade so migrations honor a custom vault schema (§5.3);
    // defaults preserve the pre-injection behavior for existing callers.
    this.schema = schema ?? new SchemaRegistry(DEFAULT_SCHEMA);
  }

  /**
   * Migrate the vault from its current (possibly v0/unversioned) state to
   * `targetVersion`. With `dryRun`, reports changes but writes nothing.
   */
  async migrate(options: MigrateOptions): Promise<MigrationResult> {
    const { targetVersion, dryRun = false } = options;
    const result: MigrationResult = {
      success: true,
      fromVersion: 0,
      toVersion: targetVersion,
      dryRun,
      entitiesModified: 0,
      changes: [],
      duplicatesRepaired: [],
      errors: [],
    };

    try {
      // Read current schema version
      const schemaPath = `${this.vaultPath}/schema.json`;
      let currentVersion = 0;
      if (await this.fs.exists(schemaPath)) {
        const schemaContent = await this.fs.readFile(schemaPath);
        const schema = JSON.parse(schemaContent);
        currentVersion = schema.schemaVersion || 0;
      }
      result.fromVersion = currentVersion;

      // If already at target version, return no-op
      if (currentVersion >= targetVersion) {
        return result;
      }

      // Discover all entity files
      const files = await this.discoverEntityFiles();

      if (files.length === 0) {
        // No files to migrate - add this as an error for debugging
        result.errors.push({
          field: 'discoverEntityFiles',
          message: `No entity files discovered in ${this.vaultPath}`,
          code: 'NO_FILES',
        });
        return result;
      }

      // Track duplicate IDs
      const idIndex = new Map<EntityId, FileMetadata[]>();
      for (const file of files) {
        const existing = idIndex.get(file.id) || [];
        existing.push(file);
        idIndex.set(file.id, existing);
      }

      // Step 1-6: Process each file
      let modifiedCount = 0;
      for (const file of files) {
        const modified = await this.migrateFile(file, idIndex, result);
        if (modified && !dryRun) {
          modifiedCount++;
          // If file needs to be moved (archive consolidation)
          if (file.newPath) {
            const newPath = file.newPath;
            // Ensure target directory exists
            const targetDir = newPath.substring(0, newPath.lastIndexOf('/'));
            if (!(await this.fs.exists(targetDir))) {
              await this.fs.createDir(targetDir);
            }
            // Write migrated content to new location
            await this.fs.writeFile(newPath, file.content);
            // Delete old file
            await this.fs.deleteFile(file.path);
          } else {
            // Write migrated content to same location
            await this.fs.writeFile(file.path, file.content);
          }
          result.entitiesModified++;
        }
      }

      // Step 1: Write schema.json if not dry-run
      if (!dryRun) {
        const schemaDoc = {
          schemaVersion: targetVersion,
          migratedAt: new Date().toISOString(),
        };
        await this.fs.writeFile(schemaPath, JSON.stringify(schemaDoc, null, 2));
      }

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push({
        field: 'migrate',
        message: (error as Error).message,
        code: 'MIGRATION_ERROR',
      });
      return result;
    }
  }

  private async discoverEntityFiles(): Promise<FileMetadata[]> {
    const files: FileMetadata[] = [];
    const allPaths: string[] = [];

    // Recursively collect all paths
    const visit = async (dir: string) => {
      const entries = await this.fs.readDir(dir);
      for (const entry of entries) {
        if (entry.isDirectory) {
          await visit(entry.path);
        } else {
          allPaths.push(entry.path);
        }
      }
    };

    try {
      await visit(this.vaultPath);
    } catch {
      // Vault path may not exist
      return files;
    }

    for (const path of allPaths) {
      if (!path.endsWith('.md')) continue;
      if (!path.includes('/entities/') && !path.includes('/archive/')) continue;

      const content = await this.fs.readFile(path);
      const { frontmatter, body } = this.splitFrontmatter(content);

      const id = frontmatter.id as EntityId;
      const type = frontmatter.type as string;
      const archived = frontmatter.archived === true;

      if (id && type) {
        files.push({ path, id, type, archived, content, frontmatter });
      }
    }

    return files;
  }

  private async migrateFile(
    file: FileMetadata,
    idIndex: Map<EntityId, FileMetadata[]>,
    result: MigrationResult
  ): Promise<boolean> {
    try {
      // Parse frontmatter fresh (don't rely on the cached one)
      const { frontmatter, body } = this.splitFrontmatter(file.content);
      const modified = await this.migrateFileInternal(file, frontmatter, body, idIndex, result);

      // Rebuild content if modified
      if (modified) {
        file.content = this.buildContent(frontmatter, body);
      }

      return modified;
    } catch (error) {
      result.errors.push({
        field: `${file.id}.migrate`,
        message: (error as Error).message,
        code: 'FILE_MIGRATION_ERROR',
      });
      return false;
    }
  }

  private async migrateFileInternal(
    file: FileMetadata,
    fm: Record<string, unknown>,
    body: string,
    idIndex: Map<EntityId, FileMetadata[]>,
    result: MigrationResult
  ): Promise<boolean> {
    let modified = false;

    // Step 2: Field transformations
    // - Merge `updated` into `updated_at` (newer wins)
    if ('updated' in fm && 'updated_at' in fm) {
      const updated = new Date(fm.updated as string);
      const updatedAt = new Date(fm.updated_at as string);
      if (updated > updatedAt) {
        fm.updated_at = fm.updated;
      }
      delete fm.updated;
      modified = true;
      result.changes.push({
        entityId: file.id,
        path: file.path as VaultPath,
        kind: 'merge-updated',
        detail: `Merged updated into updated_at`,
      });
    }

    // - Convert `effort` to `workstream`
    if ('effort' in fm) {
      const effortMap: Record<string, string> = {
        dev: 'engineering',
        design: 'design',
        product: 'product',
      };
      fm.workstream = effortMap[fm.effort as string] || fm.effort;
      delete fm.effort;
      modified = true;
      result.changes.push({
        entityId: file.id,
        path: file.path as VaultPath,
        kind: 'effort-to-workstream',
        detail: `Converted effort to workstream`,
      });
    }

    // - Drop `cssclasses`
    if ('cssclasses' in fm) {
      delete fm.cssclasses;
      modified = true;
      result.changes.push({
        entityId: file.id,
        path: file.path as VaultPath,
        kind: 'drop-key',
        detail: 'Dropped cssclasses',
      });
    }

    // Step 3: Status validation
    const typeDef = this.schema.getEntityType(file.type);
    if (typeDef) {
      // Fill missing status
      if (!fm.status) {
        fm.status = typeDef.defaultStatus;
        modified = true;
        result.changes.push({
          entityId: file.id,
          path: file.path as VaultPath,
          kind: 'fill-status',
          detail: `Filled missing status with ${typeDef.defaultStatus}`,
        });
      }

      // Remap invalid statuses
      const validStatuses = typeDef.statuses;
      const currentStatus = fm.status as string;
      if (currentStatus && !validStatuses.includes(currentStatus)) {
        // Decision: Accepted → Decided
        const statusMap: Record<string, string> = {
          Accepted: 'Decided',
          Proposed: 'Draft',
        };
        fm.status = statusMap[currentStatus] || typeDef.defaultStatus;
        modified = true;
        result.changes.push({
          entityId: file.id,
          path: file.path as VaultPath,
          kind: 'status-remap',
          detail: `Remapped ${currentStatus} → ${fm.status}`,
        });
      }
    }

    // Step 4: Relationship migrations
    // - Decision: `blocks` → `affects`
    if (file.type === 'decision' && 'blocks' in fm) {
      const blocks = Array.isArray(fm.blocks) ? fm.blocks : [fm.blocks];
      fm.affects = blocks;
      delete fm.blocks;
      modified = true;
      result.changes.push({
        entityId: file.id,
        path: file.path as VaultPath,
        kind: 'blocks-to-affects',
        detail: 'Merged decision blocks into affects',
      });
    }

    // - Convert `enables` → `blocks`
    if ('enables' in fm) {
      const enables = Array.isArray(fm.enables) ? fm.enables : [fm.enables];
      const existing = Array.isArray(fm.blocks) ? fm.blocks : fm.blocks ? [fm.blocks] : [];
      fm.blocks = [...new Set([...existing, ...enables])];
      delete fm.enables;
      modified = true;
      result.changes.push({
        entityId: file.id,
        path: file.path as VaultPath,
        kind: 'enables-to-blocks',
        detail: 'Converted enables to blocks',
      });
    }

    // Step 5: Duplicate ID repair
    const duplicates = idIndex.get(file.id) || [];
    if (duplicates.length > 1) {
      // Keep active, reassign archived
      if (file.archived) {
        const newId = `${file.id}-migrated-${Date.now()}` as EntityId;
        fm.id = newId;
        file.id = newId;
        modified = true;
        result.duplicatesRepaired.push(file.id);
        result.changes.push({
          entityId: file.id,
          path: file.path as VaultPath,
          kind: 'id-repair',
          detail: `Reassigned duplicate archived ID to ${newId}`,
        });
      }
    }

    // Step 6: Archive consolidation (mark for move, actual move happens after content is rebuilt)
    if (file.archived && file.path && file.path.includes('/archive/2026-Q')) {
      const type = getEntityTypeFromId(file.id, this.schema);
      if (!type) return modified;

      const typeFolder = this.schema.getEntityType(type)?.folder;
      if (!typeFolder) return modified;

      const fileName = file.path.split('/').pop();
      if (!fileName) return modified;

      const newPath = `${this.vaultPath}/archive/${typeFolder}/${fileName}`;

      // Mark the file as needing to be moved
      file.newPath = newPath;
      modified = true;
      result.changes.push({
        entityId: file.id,
        path: newPath as VaultPath,
        kind: 'archive-move',
        detail: `Consolidated to archive/${typeFolder}/`,
      });
    }

    return modified;
  }

  private splitFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const parts = content.split(/^---$/m);
    if (parts.length < 3) {
      return { frontmatter: {}, body: content };
    }

    const fmText = parts[1].trim();
    const body = parts.slice(2).join('---');

    try {
      const frontmatter = parseYaml(fmText) as Record<string, unknown>;
      return { frontmatter, body };
    } catch {
      return { frontmatter: {}, body: content };
    }
  }

  private buildContent(frontmatter: Record<string, unknown>, body: string): string {
    const fmText = stringifyYaml(frontmatter);
    return `---\n${fmText}---${body}`;
  }
}
