/**
 * EntityValidator — validate entities against schema rules. (§8)
 *
 * Schema-driven validation:
 *   - per-type status vocabulary (decision rejects "In Progress", document rejects "Blocked").
 *   - cardinality (parent=one rejects array; children=many rejects scalar) — the §9 bug guard.
 *   - relationship target-type matrix, required fields, reference existence.
 */

import type { EntityId, RuntimeEntity, ValidationError } from './types.js';
import type { SchemaRegistry } from './schema-registry.js';
import { getEntityTypeFromId } from './id-allocator.js';

export class EntityValidator {
  constructor(private readonly schema: SchemaRegistry) {}

  /** Returns validation errors, or [] if valid. */
  validate(entity: RuntimeEntity): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate status against type vocabulary
    const validStatuses = this.schema.getStatuses(entity.type);
    if (!validStatuses.includes(entity.status)) {
      errors.push({
        field: 'status',
        code: 'invalid_status',
        message: `Invalid status "${entity.status}" for type ${entity.type}. Valid: ${validStatuses.join(', ')}`,
      });
    }

    // Validate required title
    if (!entity.title || entity.title.trim() === '') {
      errors.push({
        field: 'title',
        code: 'required_field',
        message: 'Title is required',
      });
    }

    // Validate required fields
    const typeFields = this.schema.getFields(entity.type);
    for (const field of typeFields) {
      if (field.required) {
        const value = entity.fields[field.name];
        if (value === undefined || value === null || value === '') {
          errors.push({
            field: field.name,
            code: 'required_field',
            message: `Required field "${field.name}" is missing`,
          });
        }
      }
    }

    // Validate relationship cardinality and targets
    // Process each relationship field present in the entity
    for (const [fieldName, value] of Object.entries(entity.relationships)) {
      if (value === undefined || value === null) continue;

      // Find the relationship and pair that defines this field
      const rel = this.schema.getRelationshipForField(fieldName);
      if (!rel) continue;

      // Find all pairs that apply to this entity type and field
      const applicablePairs = rel.pairs.filter((p) => {
        if (p.forward === fieldName) {
          return p.from === entity.type || p.from === '*';
        }
        if (p.reverse === fieldName) {
          return p.to === entity.type || p.to === '*';
        }
        return false;
      });

      if (applicablePairs.length === 0) continue;

      // Determine if this is forward or reverse (from first pair)
      const isForward = applicablePairs[0].forward === fieldName;
      const cardinality = this.schema.getCardinalityForField(fieldName);

      // Validate cardinality
      if (cardinality === 'one' && Array.isArray(value)) {
        errors.push({
          field: fieldName,
          code: 'cardinality_violation',
          message: `Field "${fieldName}" expects a single value, got array`,
        });
      } else if (cardinality === 'many' && !Array.isArray(value)) {
        errors.push({
          field: fieldName,
          code: 'cardinality_violation',
          message: `Field "${fieldName}" expects an array, got single value`,
        });
      }

      // Collect all valid target types from applicable pairs
      const validTargetTypes = new Set<string>();
      for (const pair of applicablePairs) {
        const targetType = isForward ? pair.to : pair.from;
        if (targetType === '*') {
          validTargetTypes.add('*');
          break; // Wildcard means any type is valid
        }
        validTargetTypes.add(targetType);
      }

      // Validate target types
      if (!validTargetTypes.has('*')) {
        const targets = Array.isArray(value) ? value : [value];
        for (const targetId of targets) {
          const targetType = getEntityTypeFromId(targetId, this.schema);
          if (targetType && !validTargetTypes.has(targetType)) {
            errors.push({
              field: fieldName,
              code: 'invalid_relationship_target',
              message: `Field "${fieldName}" points to ${targetId} (type: ${targetType}), but expected one of: ${Array.from(validTargetTypes).join(', ')}`,
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Validate including cross-entity reference existence (relationship targets
   * must resolve to an entity in the provided set).
   */
  validateWithReferences(
    entity: RuntimeEntity,
    known: Map<EntityId, RuntimeEntity>
  ): ValidationError[] {
    const errors = this.validate(entity);

    // Check relationship references exist
    for (const [field, value] of Object.entries(entity.relationships)) {
      const targets = Array.isArray(value) ? value : [value];
      for (const targetId of targets) {
        if (typeof targetId === 'string' && !known.has(targetId)) {
          errors.push({
            field,
            code: 'dangling_reference',
            message: `Relationship "${field}" references non-existent entity: ${targetId}`,
          });
        }
      }
    }

    return errors;
  }
}
