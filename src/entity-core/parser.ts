/**
 * EntityParser — YAML frontmatter + Markdown body → RuntimeEntity. (§7.2)
 *
 * Schema-driven parser that extracts all system fields, custom fields,
 * relationships, and unknown passthrough keys. Driven by suite B.
 */

import YAML from 'yaml';
import type { RuntimeEntity, VaultPath } from './types.js';
import type { SchemaRegistry } from './schema-registry.js';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export class EntityParser {
  constructor(private readonly schema: SchemaRegistry) {}

  parse(content: string, filePath: VaultPath): RuntimeEntity {
    // Extract frontmatter
    const { frontmatter } = this.extractFrontmatter(content);

    if (!frontmatter.id || typeof frontmatter.id !== 'string') {
      throw new ParseError('Missing or invalid id field');
    }
    if (!frontmatter.type || typeof frontmatter.type !== 'string') {
      throw new ParseError('Missing or invalid type field');
    }

    const id = frontmatter.id as string;
    const type = frontmatter.type as string;

    // System fields
    const entity: RuntimeEntity = {
      id,
      type,
      title: (frontmatter.title as string) || 'Untitled',
      status: (frontmatter.status as string) || this.schema.getDefaultStatus(type),
      workstream: (frontmatter.workstream as string) || this.schema.getDefaultWorkstream(),
      created_at: (frontmatter.created_at as string) || new Date().toISOString(),
      updated_at: (frontmatter.updated_at as string) || new Date().toISOString(),
      archived: Boolean(frontmatter.archived),
      vault_path: (frontmatter.vault_path as string) || filePath,
      canvas_source: (frontmatter.canvas_source as string) || '',
      fields: {},
      relationships: {},
    };

    // Extract custom fields based on schema
    const typeFields = this.schema.getFields(type);
    const systemFields = new Set(this.schema.getSystemFields());

    for (const field of typeFields) {
      const value = frontmatter[field.name];
      if (value !== undefined && value !== null) {
        entity.fields[field.name] = value;
      }
    }

    // Extract relationship fields
    const relationships = this.schema.getRelationshipsForType(type);
    const relationshipFieldNames = new Set<string>();

    for (const rel of relationships) {
      for (const pair of rel.pairs) {
        if (pair.from === type || pair.from === '*') {
          relationshipFieldNames.add(pair.forward);
          const value = frontmatter[pair.forward];
          if (value !== undefined && value !== null) {
            entity.relationships[pair.forward] = value as string | string[];
          }
        }
        if (pair.to === type || pair.to === '*') {
          relationshipFieldNames.add(pair.reverse);
          const value = frontmatter[pair.reverse];
          if (value !== undefined && value !== null) {
            entity.relationships[pair.reverse] = value as string | string[];
          }
        }
      }
    }

    // Extract passthrough fields (unknown keys)
    const customFieldNames = new Set(typeFields.map((f) => f.name));
    const passthrough: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(frontmatter)) {
      if (
        !systemFields.has(key) &&
        !customFieldNames.has(key) &&
        !relationshipFieldNames.has(key) &&
        value !== undefined &&
        value !== null
      ) {
        passthrough[key] = value;
      }
    }

    if (Object.keys(passthrough).length > 0) {
      entity.passthrough = passthrough;
    }

    return entity;
  }

  private extractFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const yamlContent = match[1];
    const body = match[2] || '';

    try {
      const frontmatter = YAML.parse(yamlContent) as Record<string, unknown>;
      return { frontmatter: frontmatter || {}, body };
    } catch (err) {
      throw new ParseError(`Failed to parse YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
