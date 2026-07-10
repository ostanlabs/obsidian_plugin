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
      // Types excluded from cross-workstream positioning. Absent ⇒ default ['task']
      // to preserve prior behavior (tasks never get cross-ws constraints).
      const excluded = pos.crossWsExcludedTypes ?? ['task'];
      for (const p of rel.pairs) {
        rules.push({
          sourceType: p.from, field: p.forward, targetType: p.to, action: 'sequencing', direction: fwd,
          ...(pos.crossWsPositioning ? { crossWsPositioning: !excluded.includes(p.from) } : {}),
        });
        if (pos.emitReverseRule) {
          rules.push({
            sourceType: p.to, field: p.reverse, targetType: p.from, action: 'sequencing', direction: rev,
            ...(pos.crossWsPositioning ? { crossWsPositioning: !excluded.includes(p.to) } : {}),
          });
        }
      }
    }
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Relationship-field / validation-policy derivations
// (single source of truth for lists previously hardcoded in mcp.ts and util/*)
// ---------------------------------------------------------------------------

/**
 * Every forward+reverse relationship field name across all relationships, deduped,
 * in stable (schema declaration) order. Replaces the hardcoded REL_FIELDS list in
 * mcp.ts's validate_project.
 */
export function getAllRelationshipFieldNames(schema: Schema): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const rel of schema.relationships) {
    for (const p of rel.pairs) {
      for (const f of [p.forward, p.reverse]) {
        if (!seen.has(f)) { seen.add(f); names.push(f); }
      }
    }
  }
  return names;
}

/**
 * Ordering constraints for the layout reconciler, derived from sequencing
 * relationships. Replaces the hardcoded ORDERING_RELATIONSHIPS list in
 * util/relationshipReconciler.ts.
 *
 * CRITERION: only sequencing relationships with `emitReverseRule === true`
 * contribute (the reconciler treats each ordering field symmetrically, so a
 * one-sided sequencing rel like supersession/versioning is excluded — matching
 * the historical hardcoded list). The forward field gets `forwardDirection`
 * (default 'after'); the reverse field gets the opposite. Field names are
 * deduped across pairs, stable order.
 */
export function buildOrderingRelationships(
  schema: Schema
): Array<{ field: string; direction: 'before' | 'after' }> {
  const out: Array<{ field: string; direction: 'before' | 'after' }> = [];
  const seen = new Set<string>();
  const push = (field: string, direction: 'before' | 'after') => {
    if (!seen.has(field)) { seen.add(field); out.push({ field, direction }); }
  };
  for (const rel of schema.relationships) {
    const pos = rel.positioning;
    if (!pos || pos.role !== 'sequencing' || pos.emitReverseRule !== true) continue;
    const fwd = pos.forwardDirection ?? 'after';
    const rev = fwd === 'after' ? 'before' : 'after';
    for (const p of rel.pairs) {
      push(p.forward, fwd);
      push(p.reverse, rev);
    }
  }
  return out;
}

/**
 * Required-parent rules from `validation.requiredForTypes`: for each relationship
 * that declares them, the entity types whose FORWARD field must be non-empty
 * (hard violation: ORPHANED_ENTITY). `field` is the pairs' forward field.
 * Replaces the hardcoded story/task-need-parent rule in mcp.ts's validate_project.
 */
export function getRequiredParentRules(
  schema: Schema
): Array<{ relationship: string; field: string; types: string[] }> {
  const out: Array<{ relationship: string; field: string; types: string[] }> = [];
  for (const rel of schema.relationships) {
    const types = rel.validation?.requiredForTypes;
    if (!types || types.length === 0) continue;
    // A relationship's pairs may (in theory) use different forward field names;
    // emit one rule per distinct forward field.
    const fields = [...new Set(rel.pairs.map((p) => p.forward))];
    for (const field of fields) {
      out.push({ relationship: rel.name, field, types: [...types] });
    }
  }
  return out;
}

export interface FanoutRule {
  relationship: string;
  end: 'forward' | 'reverse';
  /** The relationship field the limit applies to. */
  field: string;
  limit: number;
  /** Entity types the limited field sits on (pairs' from types for forward, to types for reverse; '*' allowed). */
  sourceTypes: string[];
}

/**
 * Flatten `validation.maxForwardTargets` / `maxReverseTargets` into advisory
 * fan-out rules. Replaces the hardcoded FANOUT_LIMITS map in mcp.ts's
 * validate_project. One entry per (relationship, end, field).
 */
export function getFanoutRules(schema: Schema): FanoutRule[] {
  const out: FanoutRule[] = [];
  for (const rel of schema.relationships) {
    const v = rel.validation;
    if (!v) continue;
    const emit = (end: 'forward' | 'reverse', limit: number) => {
      // field + carrier types per end: forward lives on `from`, reverse on `to`.
      const byField = new Map<string, string[]>();
      for (const p of rel.pairs) {
        const field = end === 'forward' ? p.forward : p.reverse;
        const carrier = end === 'forward' ? p.from : p.to;
        const arr = byField.get(field) ?? [];
        if (!arr.includes(carrier)) arr.push(carrier);
        byField.set(field, arr);
      }
      for (const [field, sourceTypes] of byField) {
        out.push({ relationship: rel.name, end, field, limit, sourceTypes });
      }
    };
    if (v.maxForwardTargets !== undefined) emit('forward', v.maxForwardTargets);
    if (v.maxReverseTargets !== undefined) emit('reverse', v.maxReverseTargets);
  }
  return out;
}

/**
 * Forward fields of relationships flagged `emitWhenEmpty`: the serializer emits
 * these even when empty so users see the slot in frontmatter. Replaces the
 * relationship half of the hardcoded `alwaysInclude` list in util/frontmatter.ts.
 * Deduped, stable order.
 */
export function getEmitWhenEmptyFields(schema: Schema): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rel of schema.relationships) {
    if (!rel.emitWhenEmpty) continue;
    for (const p of rel.pairs) {
      if (!seen.has(p.forward)) { seen.add(p.forward); out.push(p.forward); }
    }
  }
  return out;
}
