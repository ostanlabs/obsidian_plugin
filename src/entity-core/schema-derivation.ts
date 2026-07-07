/**
 * schema-derivation.ts — SINGLE SOURCE OF TRUTH adapters.
 *
 * The relationship model lives once, in the active Schema (default-schema.ts or a
 * vault schema.json). Both consumers derive from it here:
 *   - buildValidationAllowList(schema)  → the MCP validator's allow-list
 *   - buildRelationshipRules(schema)     → the plugin positioning engine's rules
 *
 * This removes the previous triplicate hand-synced definitions
 * (default-schema.ts / mcp.ts ALLOWED / positioningV4.ts RELATIONSHIP_RULES).
 */

import type { Schema } from './types.js';

// ---------------------------------------------------------------------------
// Validation allow-list  (field → allowed target entity types, per entity type)
// ---------------------------------------------------------------------------

/**
 * Map each relationship field to its inverse (forward↔reverse), derived from the
 * schema. Used by ProjectIndex to store reverse edges under the correct field name
 * — replacing a previously hardcoded map that had drifted from the schema
 * (e.g. `blocks↔blocked_by`, `parent_of↔child_of`).
 */
export function buildReverseRelationMap(schema: Schema): Record<string, string> {
  const map: Record<string, string> = {};
  for (const rel of schema.relationships) {
    for (const p of rel.pairs) {
      map[p.forward] = p.reverse;
      map[p.reverse] = p.forward;
    }
  }
  return map;
}

/** For each entity type: the relationship fields it MAY carry and the target types allowed. */
export function buildValidationAllowList(schema: Schema): Record<string, Record<string, string[]>> {
  const allow: Record<string, Record<string, string[]>> = {};
  const add = (type: string, field: string, target: string) => {
    if (type === '*' || target === '*') return; // wildcards can't be enumerated
    (allow[type] ??= {});
    (allow[type][field] ??= []);
    if (!allow[type][field].includes(target)) allow[type][field].push(target);
  };
  for (const rel of schema.relationships) {
    for (const p of rel.pairs) {
      add(p.from, p.forward, p.to);   // FROM entity carries `forward` → TO
      add(p.to, p.reverse, p.from);   // TO entity carries `reverse` → FROM
    }
  }
  return allow;
}

// ---------------------------------------------------------------------------
// Positioning rules  (mirrors positioningV4's RelationshipRule shape)
// ---------------------------------------------------------------------------

export interface DerivedRelationshipRule {
  sourceType: string;
  field: string;
  targetType: string | string[] | 'workstream';
  action: 'containment' | 'sequencing';
  direction: 'child' | 'parent' | 'before' | 'after';
  priority?: number;
  crossWsPositioning?: boolean;
}

/**
 * Derive the flat positioning ruleset from the schema's `positioning` metadata.
 * Reproduces the previously hand-written RELATIONSHIP_RULES:
 *   - containment: emits a CHILD-placement rule (child.field → container, 'child'),
 *     target types aggregated across pairs; optionally the mirror PARENT rule.
 *   - sequencing: emits the forward-field rule (and, if requested, the reverse field
 *     in the opposite direction). crossWsPositioning is suppressed for tasks.
 */
export function buildRelationshipRules(schema: Schema): DerivedRelationshipRule[] {
  const rules: DerivedRelationshipRule[] = [];

  // Structural root: milestones are placed in their workstream lane (no parent).
  rules.push({ sourceType: 'milestone', field: 'workstream', targetType: 'workstream', action: 'containment', direction: 'child' });

  for (const rel of schema.relationships) {
    const pos = rel.positioning;
    if (!pos) continue;

    if (pos.role === 'containment') {
      const containerIsTo = pos.containerEnd !== 'from'; // default 'to'
      const childRules = new Map<string, DerivedRelationshipRule>();

      for (const p of rel.pairs) {
        const childType     = containerIsTo ? p.from : p.to;
        const containerType = containerIsTo ? p.to : p.from;
        const childField    = containerIsTo ? p.forward : p.reverse; // child's field toward container
        const parentField   = containerIsTo ? p.reverse : p.forward; // container's field toward child

        // CHILD rule (aggregate container target types by child+field)
        const key = `${childType}|${childField}`;
        const existing = childRules.get(key);
        if (existing) {
          const arr = Array.isArray(existing.targetType) ? existing.targetType : [existing.targetType as string];
          if (!arr.includes(containerType)) arr.push(containerType);
          existing.targetType = arr;
        } else {
          childRules.set(key, {
            sourceType: childType, field: childField, targetType: containerType,
            action: 'containment', direction: 'child',
            ...(pos.priority !== undefined ? { priority: pos.priority } : {}),
          });
        }

        // PARENT mirror rule (container.field → child)
        if (pos.emitParentRule) {
          rules.push({ sourceType: containerType, field: parentField, targetType: childType, action: 'containment', direction: 'parent' });
        }
      }
      for (const r of childRules.values()) rules.push(r);

    } else { // sequencing
      const fwd = pos.forwardDirection ?? 'after';
      const rev = fwd === 'after' ? 'before' : 'after';
      for (const p of rel.pairs) {
        rules.push({
          sourceType: p.from, field: p.forward, targetType: p.to, action: 'sequencing', direction: fwd,
          ...(pos.crossWsPositioning ? { crossWsPositioning: p.from !== 'task' } : {}),
        });
        if (pos.emitReverseRule) {
          rules.push({
            sourceType: p.to, field: p.reverse, targetType: p.from, action: 'sequencing', direction: rev,
            ...(pos.crossWsPositioning ? { crossWsPositioning: p.to !== 'task' } : {}),
          });
        }
      }
    }
  }
  return rules;
}
