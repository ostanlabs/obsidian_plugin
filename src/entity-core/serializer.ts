/**
 * EntitySerializer — Entity<T> → YAML frontmatter + Markdown body. (§7.1)
 *
 * Schema-driven serializer that preserves all system fields, custom fields,
 * relationships, and passthrough keys. Driven by suite B (data-loss guard).
 */

import YAML from 'yaml';
import type { RuntimeEntity } from './types.js';
import type { SchemaRegistry } from './schema-registry.js';

export class EntitySerializer {
  constructor(private readonly schema: SchemaRegistry) {}

  serialize(entity: RuntimeEntity): string {
    const frontmatter: Record<string, unknown> = {};

    // System fields (always present)
    frontmatter.id = entity.id;
    frontmatter.type = entity.type;
    frontmatter.title = entity.title;
    frontmatter.status = entity.status;
    frontmatter.workstream = entity.workstream;
    frontmatter.created_at = entity.created_at;
    frontmatter.updated_at = entity.updated_at;
    if (entity.archived) {
      frontmatter.archived = entity.archived;
    }
    frontmatter.vault_path = entity.vault_path;
    if (entity.canvas_source) {
      frontmatter.canvas_source = entity.canvas_source;
    }

    // Custom fields from schema
    const typeFields = this.schema.getFields(entity.type);
    for (const field of typeFields) {
      const value = entity.fields[field.name];
      if (value !== undefined && value !== null) {
        frontmatter[field.name] = value;
      }
    }

    // Relationship fields
    const relationships = this.schema.getRelationshipsForType(entity.type);
    for (const rel of relationships) {
      for (const pair of rel.pairs) {
        // Check if this entity can have this field (as forward or reverse)
        if (pair.from === entity.type || pair.from === '*') {
          const value = entity.relationships[pair.forward];
          if (value !== undefined && value !== null) {
            frontmatter[pair.forward] = value;
          }
        }
        if (pair.to === entity.type || pair.to === '*') {
          const value = entity.relationships[pair.reverse];
          if (value !== undefined && value !== null) {
            frontmatter[pair.reverse] = value;
          }
        }
      }
    }

    // Passthrough fields (unknown keys preserved verbatim)
    if (entity.passthrough) {
      for (const [key, value] of Object.entries(entity.passthrough)) {
        if (!(key in frontmatter) && value !== undefined && value !== null) {
          frontmatter[key] = value;
        }
      }
    }

    // Serialize to YAML frontmatter
    const yaml = YAML.stringify(frontmatter, {
      lineWidth: 0, // Don't wrap lines
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
    });

    return `---\n${yaml}---\n`;
  }
}
