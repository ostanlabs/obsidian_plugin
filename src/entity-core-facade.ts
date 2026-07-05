/**
 * EntityCoreFacade — High-level API for Plugin integration.
 * 
 * This facade provides a unified interface to entity-core for the plugin,
 * abstracting away the individual modules and providing convenient methods
 * for common operations.
 */

import type { Vault } from 'obsidian';
import { ObsidianVaultAdapter } from './adapters/obsidian-vault-adapter.js';
import { SchemaRegistry } from './entity-core/schema-registry.js';
import { DEFAULT_SCHEMA } from './entity-core/default-schema.js';
import { EntityParser } from './entity-core/parser.js';
import { EntitySerializer } from './entity-core/serializer.js';
import { EntityValidator } from './entity-core/validator.js';
import { IDAllocator } from './entity-core/id-allocator.js';
import { PathResolver, type PathResolverConfig } from './entity-core/path-resolver.js';
import { RelationshipGraph } from './entity-core/relationship-graph.js';
import { CanvasManager } from './entity-core/canvas.js';
import { SchemaMigrator } from './entity-core/migrator.js';
import type {
  RuntimeEntity,
  EntityType,
  EntityId,
  FileSystem,
  EntityIndex,
  ValidationError,
} from './entity-core/types.js';

export interface EntityCoreConfig {
  vault: Vault;
  vaultPath: string;
  entitiesFolder: string;
  archiveFolder: string;
  canvasFolder: string;
}

/**
 * EntityCoreFacade provides a simplified API for plugin code.
 * 
 * Usage:
 * ```ts
 * const core = new EntityCoreFacade({
 *   vault: this.app.vault,
 *   vaultPath: this.app.vault.adapter.basePath,
 *   entitiesFolder: 'entities',
 *   archiveFolder: 'archive',
 *   canvasFolder: 'projects',
 * });
 * 
 * // Create an entity
 * const entity = await core.createEntity('task', 'Implement feature X');
 * 
 * // Read an entity
 * const entity = await core.getEntity('T-042');
 * 
 * // Update an entity
 * entity.status = 'Completed';
 * await core.updateEntity(entity);
 * ```
 */
export class EntityCoreFacade {
  private readonly fs: FileSystem;
  private readonly schema: SchemaRegistry;
  private readonly parser: EntityParser;
  private readonly serializer: EntitySerializer;
  private readonly validator: EntityValidator;
  private readonly pathResolver: PathResolver;
  
  // These require an index, which will be provided by the plugin
  private allocator?: IDAllocator;
  private relationshipGraph?: RelationshipGraph;
  private canvasManager?: CanvasManager;
  private migrator?: SchemaMigrator;

  constructor(private readonly config: EntityCoreConfig) {
    this.fs = new ObsidianVaultAdapter(config.vault);
    this.schema = new SchemaRegistry(DEFAULT_SCHEMA);
    this.parser = new EntityParser(this.schema);
    this.serializer = new EntitySerializer(this.schema);
    this.validator = new EntityValidator(this.schema);
    this.pathResolver = new PathResolver(this.schema, {
      vaultPath: config.vaultPath,
      entitiesFolder: config.entitiesFolder,
      archiveFolder: config.archiveFolder,
      canvasFolder: config.canvasFolder,
    });
  }

  /**
   * Initialize modules that require an EntityIndex.
   * The plugin should call this after creating its index.
   *
   * This method accepts the entity-core EntityIndex interface, not the plugin's EntityIndex.
   * Use EntityIndexAdapter to wrap the plugin's index before passing it here.
   */
  initializeWithIndex(index: EntityIndex): void {
    this.allocator = new IDAllocator(this.schema, index);
    this.relationshipGraph = new RelationshipGraph(this.schema, index);
    this.canvasManager = new CanvasManager(this.schema, this.fs, this.pathResolver);
    this.migrator = new SchemaMigrator(this.fs, this.config.vaultPath, this.pathResolver);
  }

  // =============================================================================
  // Entity Operations
  // =============================================================================

  /**
   * Parse an entity from markdown content.
   */
  parseEntity(content: string, path: string): RuntimeEntity {
    return this.parser.parse(content, path);
  }

  /**
   * Serialize an entity to markdown.
   */
  serializeEntity(entity: RuntimeEntity): string {
    return this.serializer.serialize(entity);
  }

  /**
   * Validate an entity.
   */
  validateEntity(entity: RuntimeEntity): ValidationError[] {
    return this.validator.validate(entity);
  }

  /**
   * Allocate a new ID for an entity type.
   */
  async allocateId(type: EntityType): Promise<EntityId> {
    if (!this.allocator) {
      throw new Error('EntityCoreFacade not initialized with index. Call initializeWithIndex() first.');
    }
    return this.allocator.allocate(type);
  }

  /**
   * Generate filename for an entity.
   */
  generateFilename(id: EntityId, title: string): string {
    return this.pathResolver.generateFilename(id, title);
  }

  /**
   * Get folder path for an entity type.
   */
  getTypeFolderPath(type: EntityType): string {
    return this.pathResolver.getTypeFolderPath(type);
  }

  /**
   * Get schema registry.
   */
  getSchema(): SchemaRegistry {
    return this.schema;
  }

  /**
   * Get filesystem adapter.
   */
  getFileSystem(): FileSystem {
    return this.fs;
  }

  /**
   * Get relationship graph.
   */
  getRelationshipGraph(): RelationshipGraph {
    if (!this.relationshipGraph) {
      throw new Error('EntityCoreFacade not initialized with index. Call initializeWithIndex() first.');
    }
    return this.relationshipGraph;
  }

  /**
   * Get canvas manager.
   */
  getCanvasManager(): CanvasManager {
    if (!this.canvasManager) {
      throw new Error('EntityCoreFacade not initialized with index. Call initializeWithIndex() first.');
    }
    return this.canvasManager;
  }

  /**
   * Get migrator.
   */
  getMigrator(): SchemaMigrator {
    if (!this.migrator) {
      throw new Error('EntityCoreFacade not initialized with index. Call initializeWithIndex() first.');
    }
    return this.migrator;
  }
}

