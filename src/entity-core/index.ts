/**
 * @ostanlabs/entity-core — public API surface.
 *
 * Pure-TypeScript schema-driven entity engine (yaml + zod only; no fs/Obsidian).
 * The classes exported here are STUBS that throw `NOT_IMPLEMENTED` until the
 * contract suite (tests/) drives them green, module by module, per
 * SPEC_EVALUATION_AND_TDD_PLAN.md §4.3. DEFAULT_SCHEMA is real policy data.
 */

export * from './types.js';
export { DEFAULT_SCHEMA } from './default-schema.js';
export { SchemaRegistry, type SchemaLoadResult } from './schema-registry.js';
export { EntitySerializer } from './serializer.js';
export { EntityParser, ParseError } from './parser.js';
export { EntityValidator } from './validator.js';
export {
  RelationshipGraph,
  CycleError,
  type CycleCheckResult,
} from './relationship-graph.js';
export { IDAllocator, getEntityTypeFromId } from './id-allocator.js';
export { PathResolver, type PathResolverConfig } from './path-resolver.js';
export {
  SchemaMigrator,
  type MigrationResult,
  type MigrationChange,
  type MigrateOptions,
} from './migrator.js';
export {
  CanvasManager,
  type CanvasNode,
  type CanvasEdge,
  type CanvasFile,
  type Position,
  type LayoutResult,
} from './canvas.js';
export { ProjectIndex } from './project-index.js';
