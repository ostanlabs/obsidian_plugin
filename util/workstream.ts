/**
 * Pure workstream normalisation. Extracted from main.ts (Phase 5).
 *
 * Lowercases a raw workstream string and applies the schema's alias map
 * (`workstreams.normalization`, e.g. ops/devops → infra, eng/dev → engineering) so
 * aliased values collapse to their canonical workstream. This is the single source
 * of truth for workstream aliasing — previously main.ts only lowercased and ignored
 * the schema's alias map. No obsidian dependency.
 */
export function normalizeWorkstream(
  raw: string | undefined | null,
  normalization: Record<string, string> = {},
  fallback?: string,
): string | undefined {
  if (raw == null) return fallback;
  const key = String(raw).trim().toLowerCase();
  if (!key) return fallback;
  return normalization[key] ?? key;
}
