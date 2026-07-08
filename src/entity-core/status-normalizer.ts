/**
 * status-normalizer — schema-driven status/priority coercion. (refactor §7)
 *
 * Pure, fs-free helpers that normalize loosely-typed status/priority input into
 * the canonical vocabulary defined by the schema for a given entity type.
 *
 * Design (refactor §7):
 *   1. If `input` case-insensitively equals a valid status for `type` → return
 *      the canonical-cased value from the schema.
 *   2. Else consult a small alias map. Each alias maps to an ORDERED list of
 *      canonical candidates; the first candidate that is a valid status for THAT
 *      type (per the schema) wins. This is what makes context-dependent aliases
 *      resolve correctly per type — e.g. "done" → Completed (task), Complete
 *      (feature), Decided (decision), Approved (document) — and fixes the
 *      long-standing feature-status bug (features use Planned/In Progress/
 *      Complete/Deferred, not the task vocabulary).
 *   3. Else fall back to the schema's default status for `type`.
 *
 * This module is the single source of truth for the PLUGIN's convenience
 * coercion. The MCP path stays reject-only (EntityValidator) and does NOT use
 * this.
 */

import type { Schema, EntityTypeDefinition } from './types.js';

/**
 * Alias → ordered canonical candidates. Only a candidate that is a valid status
 * for the target type is emitted, so a single alias resolves differently per
 * type. Ordering encodes preference when several candidates could match.
 */
const STATUS_ALIASES: Record<string, string[]> = {
  // not-started family
  todo: ['Not Started'],
  'not started': ['Not Started'],
  'not_started': ['Not Started'],
  // in-progress family
  in_progress: ['In Progress'],
  'in progress': ['In Progress'],
  wip: ['In Progress'],
  // done family (context-dependent across types)
  done: ['Completed', 'Complete', 'Decided', 'Approved'],
  completed: ['Completed', 'Complete'],
  complete: ['Complete', 'Completed'],
  finished: ['Completed', 'Complete'],
  // blocked
  blocked: ['Blocked'],
  // pending / open (decision)
  open: ['Pending'],
  pending: ['Pending'],
  // approved / published (document → Approved, decision → Decided)
  approved: ['Approved', 'Decided'],
  published: ['Approved'],
  decided: ['Decided'],
  // document lifecycle
  draft: ['Draft'],
  review: ['Review'],
  'in review': ['Review'],
  'in_review': ['Review'],
  // superseded family
  superseded: ['Superseded'],
  deprecated: ['Superseded'],
  obsolete: ['Superseded'],
  // feature lifecycle
  planned: ['Planned'],
  deferred: ['Deferred'],
};

function findType(schema: Schema, type: string): EntityTypeDefinition | null {
  return schema.entityTypes.find((t) => t.type === type) || null;
}

function canonical(statuses: string[], value: string): string | undefined {
  const lower = value.toLowerCase();
  return statuses.find((s) => s.toLowerCase() === lower);
}

/**
 * Normalize a status string into the canonical vocabulary for `type`.
 * Returns the schema's default status for `type` when input is empty/unknown.
 */
export function normalizeStatus(schema: Schema, type: string, input?: string): string {
  const typeDef = findType(schema, type);
  const statuses = typeDef?.statuses ?? [];
  const fallback = typeDef?.defaultStatus ?? statuses[0] ?? '';

  if (input == null) return fallback;
  const trimmed = input.trim();
  if (trimmed === '') return fallback;

  // 1. Case-insensitive exact match against valid statuses.
  const exact = canonical(statuses, trimmed);
  if (exact) return exact;

  // 2. Alias map — first candidate valid for THIS type wins.
  const candidates = STATUS_ALIASES[trimmed.toLowerCase()];
  if (candidates) {
    for (const cand of candidates) {
      const match = canonical(statuses, cand);
      if (match) return match;
    }
  }

  // 3. Schema default.
  return fallback;
}

/**
 * Normalize a priority string against the schema's `priority` enum field for
 * `type`. Falls back to the field default (or Medium) when empty/unknown.
 */
export function normalizePriority(schema: Schema, type: string, input?: string): string {
  const typeDef = findType(schema, type);
  const field = typeDef?.fields.find((f) => f.name === 'priority');
  const values = (field?.values as string[] | undefined) ?? ['Low', 'Medium', 'High', 'Critical'];
  const fallback = (field?.default as string | undefined) ?? 'Medium';

  if (input == null) return fallback;
  const trimmed = input.trim();
  if (trimmed === '') return fallback;

  const exact = canonical(values, trimmed);
  if (exact) return exact;

  return fallback;
}
