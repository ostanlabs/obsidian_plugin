/**
 * SchemaRegistry — load, validate and expose the active schema. (§4.1)
 *
 * STUB: every accessor throws NOT_IMPLEMENTED. The constructor stores the schema
 * so collaborators can be constructed; behaviour is driven to green by suite A.
 */

import {
  notImplemented,
  type Cardinality,
  type EntityTypeDefinition,
  type FieldDefinition,
  type FileSystem,
  type RelationshipDefinition,
  type Schema,
} from './types.js';

export interface SchemaLoadResult {
  registry: SchemaRegistry;
  /** Non-fatal schema validation errors (invalid schema → fell back to last-good/default). */
  errors: string[];
  /** True when the built-in default was used (no/invalid schema.json). */
  usedDefault: boolean;
}

export class SchemaRegistry {
  private typeMap: Map<string, EntityTypeDefinition> = new Map();
  private relationshipMap: Map<string, RelationshipDefinition> = new Map();
  private fieldToRelationship: Map<string, RelationshipDefinition> = new Map();

  constructor(
    private readonly schema: Schema,
    private readonly validationCache: Map<string, unknown> = new Map()
  ) {
    // Build lookup maps
    for (const type of schema.entityTypes) {
      this.typeMap.set(type.type, type);
    }
    for (const rel of schema.relationships) {
      this.relationshipMap.set(rel.name, rel);
      // Map each field from all pairs to this relationship
      for (const pair of rel.pairs) {
        this.fieldToRelationship.set(pair.forward, rel);
        this.fieldToRelationship.set(pair.reverse, rel);
      }
    }
  }

  /**
   * Load schema from `<vaultPath>/schema.json`, else built-in default.
   * Invalid schema → last-good/default + errors[].
   */
  static async load(fs: FileSystem, vaultPath: string): Promise<SchemaLoadResult> {
    const schemaPath = `${vaultPath}/schema.json`;
    const errors: string[] = [];
    let usedDefault = false;

    try {
      const content = await fs.readFile(schemaPath);
      const parsed = JSON.parse(content) as Schema;

      // Basic validation
      if (!parsed.entityTypes || !Array.isArray(parsed.entityTypes)) {
        errors.push('Invalid schema: missing entityTypes array');
        throw new Error('Invalid schema');
      }
      if (!parsed.relationships || !Array.isArray(parsed.relationships)) {
        errors.push('Invalid schema: missing relationships array');
        throw new Error('Invalid schema');
      }

      return {
        registry: new SchemaRegistry(parsed),
        errors,
        usedDefault: false,
      };
    } catch (err) {
      usedDefault = true;
      // Only add error if not a simple "file not found" case
      if (errors.length === 0 && !(err instanceof Error && err.message.includes('ENOENT'))) {
        errors.push(`Failed to load schema: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Fall back to default schema
      const { DEFAULT_SCHEMA } = await import('./default-schema.js');
      return {
        registry: new SchemaRegistry(DEFAULT_SCHEMA),
        errors,
        usedDefault: true,
      };
    }
  }

  /** Raw schema object (used by migrator + tests). */
  getSchema(): Schema {
    return this.schema;
  }

  getSchemaVersion(): number {
    return this.schema.schemaVersion;
  }

  // --- Type queries -----------------------------------------------------------
  getEntityType(type: string): EntityTypeDefinition | null {
    return this.typeMap.get(type) || null;
  }

  getAllEntityTypes(): EntityTypeDefinition[] {
    return Array.from(this.typeMap.values());
  }

  getStatuses(type: string): string[] {
    const typeDef = this.getEntityType(type);
    return typeDef ? typeDef.statuses : [];
  }

  getDefaultStatus(type: string): string {
    const typeDef = this.getEntityType(type);
    return typeDef?.defaultStatus || '';
  }

  // --- Field queries ----------------------------------------------------------
  getFields(type: string): FieldDefinition[] {
    const typeDef = this.getEntityType(type);
    return typeDef?.fields || [];
  }

  getField(type: string, fieldName: string): FieldDefinition | null {
    const fields = this.getFields(type);
    return fields.find((f) => f.name === fieldName) || null;
  }

  getSystemFields(): string[] {
    return ['id', 'type', 'title', 'status', 'created_at', 'updated_at', 'workstream'];
  }

  // --- Relationship queries ---------------------------------------------------
  getRelationship(name: string): RelationshipDefinition | null {
    return this.relationshipMap.get(name) || null;
  }

  getAllRelationships(): RelationshipDefinition[] {
    return Array.from(this.relationshipMap.values());
  }

  getRelationshipsForType(type: string): RelationshipDefinition[] {
    return this.getAllRelationships().filter((rel) => {
      // Check if any pair involves this type
      return rel.pairs.some((pair) => {
        return (
          pair.from === type ||
          pair.from === '*' ||
          pair.to === type ||
          pair.to === '*'
        );
      });
    });
  }

  getRelationshipForField(fieldName: string): RelationshipDefinition | null {
    return this.fieldToRelationship.get(fieldName) || null;
  }

  getRelationshipByName(name: string): RelationshipDefinition | null {
    return this.relationshipMap.get(name) || null;
  }

  /**
   * Cardinality of a relationship field, resolved by the DIRECTION the field
   * represents (forward vs reverse). E.g. `children` is the reverse of
   * hierarchy (cardinality 'many') even though the forward `parent` is 'one'.
   * Fixes the §9 setRelationshipIds bug.
   */
  getCardinalityForField(fieldName: string): Cardinality {
    const rel = this.getRelationshipForField(fieldName);
    if (!rel) {
      throw new Error(`No relationship found for field: ${fieldName}`);
    }

    // Check which pair this field belongs to and determine forward/reverse
    for (const pair of rel.pairs) {
      if (pair.forward === fieldName) {
        return rel.cardinality.forward;
      }
      if (pair.reverse === fieldName) {
        return rel.cardinality.reverse;
      }
    }

    throw new Error(`Field ${fieldName} not found in relationship ${rel.name} pairs`);
  }

  // --- Validation -------------------------------------------------------------
  getValidator(_type: string): unknown {
    return notImplemented('SchemaRegistry.getValidator');
  }

  // --- Settings ---------------------------------------------------------------
  getIdPadding(): number {
    return this.schema.settings.idPadding;
  }

  getArchiveLayout(): 'by-type' | 'quarterly' {
    return this.schema.settings.archiveLayout;
  }

  getFilenamePattern(): string {
    return this.schema.settings.filenamePattern;
  }

  // --- Canvas -----------------------------------------------------------------
  getCanvasConfig(type: string): EntityTypeDefinition['canvas'] {
    const typeDef = this.getEntityType(type);
    return typeDef?.canvas || { width: 400, height: 300, color: '1', icon: 'file' };
  }

  // --- Workstreams ------------------------------------------------------------
  getWorkstreams(): string[] {
    if (!this.schema.workstreams) return [];
    if (Array.isArray(this.schema.workstreams)) {
      return this.schema.workstreams.map((w) => w.name);
    }
    // workstreams is an object with values array
    return this.schema.workstreams.values || [];
  }

  getDefaultWorkstream(): string {
    if (!this.schema.workstreams) return '';
    if (Array.isArray(this.schema.workstreams)) {
      return this.schema.workstreams[0]?.name || '';
    }
    return this.schema.workstreams.default || '';
  }

  normalizeWorkstream(input: string): string {
    const normalized = input.toLowerCase().trim();

    if (!this.schema.workstreams) return input;

    // Handle array format
    if (Array.isArray(this.schema.workstreams)) {
      // Check exact match first
      for (const ws of this.schema.workstreams) {
        if (ws.name.toLowerCase() === normalized) {
          return ws.name;
        }
      }

      // Check aliases
      for (const ws of this.schema.workstreams) {
        if (ws.aliases?.some((alias: string) => alias.toLowerCase() === normalized)) {
          return ws.name;
        }
      }

      return input;
    }

    // Handle object format with normalization map
    const values = this.schema.workstreams.values || [];

    // Check exact match in values
    for (const ws of values) {
      if (ws.toLowerCase() === normalized) {
        return ws;
      }
    }

    // Check normalization map
    const normMap = this.schema.workstreams.normalization || {};
    if (normMap[normalized]) {
      return normMap[normalized];
    }

    // Return input as-is if no match
    return input;
  }

  getWorkstreamColor(workstream: string): string {
    if (!this.schema.workstreams) return '#808080';

    if (Array.isArray(this.schema.workstreams)) {
      const ws = this.schema.workstreams.find((w) => w.name === workstream);
      return ws?.color || '#808080';
    }

    // Object format
    const canvas = this.schema.workstreams.canvas || {};
    return canvas[workstream]?.color || '#808080';
  }
}
