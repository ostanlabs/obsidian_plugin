/**
 * Pure node / effort colour resolution.
 *
 * Extracted from main.ts (Phase 5 pilot: move logic out of the obsidian-coupled
 * entrypoint into a plain, unit-testable module). This file imports nothing from
 * `obsidian` — the caller passes the relevant settings values as plain arguments.
 */

/** Built-in effort → Obsidian canvas colour palette. */
export function getColorForEffort(effort: string): string | undefined {
  const colorMap: Record<string, string> = {
    Business: '6',    // purple
    Infra: '4',       // orange
    Engineering: '3', // blue
    Research: '2',    // green
    Design: '1',      // red
    Marketing: '5',   // yellow
  };
  return colorMap[effort];
}

/**
 * effort → colour: an explicit per-effort override (from settings) wins; otherwise
 * the built-in palette. Returns undefined when there is no effort.
 */
export function resolveEffortColor(
  effort: string | undefined,
  effortColorMap?: Record<string, string>,
): string | undefined {
  if (!effort) return undefined;
  return effortColorMap?.[effort] || getColorForEffort(effort);
}

export interface NodeColorConfig {
  /** Colour used while an entity is in progress (overrides the effort colour). */
  inProgressColor: string;
  /** Optional per-effort colour overrides. */
  effortColorMap?: Record<string, string>;
}

/** node colour: the in-progress colour while in progress, otherwise effort-based. */
export function resolveNodeColor(
  effort: string | undefined,
  inProgress: boolean | undefined,
  config: NodeColorConfig,
): string | undefined {
  if (inProgress) return config.inProgressColor;
  return resolveEffortColor(effort, config.effortColorMap);
}
