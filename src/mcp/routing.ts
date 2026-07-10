/**
 * src/mcp/routing.ts — pure vault-routing helpers for the MCP dispatch layer
 * (MULTI_VAULT_MCP_IMPLEMENTATION_SPEC.md §6.3/§6.3b, decisions D3/D8, W8).
 *
 * Extracted from mcp.ts so the routing contract is unit-testable without
 * booting the stdio server (importing mcp.ts starts it):
 *  - `resolveVaultRef`          — the vault-argument contract: hard-required on
 *                                 mutating tools (NO default, ever); read-only
 *                                 tools default ONLY when exactly one vault is
 *                                 registered.
 *  - `assertEntityMatchesVault` — accept-then-match (D8): the API layer accepts
 *                                 any registered schema's values; DISPATCH
 *                                 matches the payload against the RESOLVED
 *                                 vault's schema and throws SchemaMismatch.
 *  - `selectEnumMode`           — the ListTools enum strategy (D8): schema-derived
 *                                 enums with exactly 1 vault, plain strings
 *                                 otherwise (never a >1-vault union enum).
 *  - `echoVault`                — every JSON tool result carries the resolved
 *                                 vault id (D3).
 */

import { SchemaMismatch } from './types.js';
import type { VaultEntry } from './types.js';
import type { Schema } from '../entity-core/types.js';

// =============================================================================
// Tool classification (spec §6.3/§11)
// =============================================================================

/** Registry-global tools — they take NO `vault` argument at all. */
export const REGISTRY_TOOLS = new Set<string>(['list_vaults', 'add_vault', 'remove_vault']);

/**
 * Mutating / cross-effect tools: `vault` is HARD-REQUIRED (D3, DO-NOT #6 —
 * never a silent default). Everything vault-scoped and not in this set is
 * read-only and may default to the sole registered vault.
 */
export const MUTATING_TOOLS = new Set<string>([
  'create_entity',
  'update_entity',
  'entities',
  'set_schema',
  'reconcile_vault',
  'update_doc',
  'manage_documents',
  'reconcile_relationships',
  'rebuild_index',
  'cleanup_completed',
  'add_workspace',
  'remove_workspace',
]);

// =============================================================================
// resolveVaultRef — the vault-argument contract (D3)
// =============================================================================

/**
 * Resolve the `vault` argument for a vault-scoped tool call.
 *  - explicit `vault` string → returned verbatim (trimmed);
 *  - missing on a MUTATING tool → loud error naming the tool (never a default);
 *  - missing on a read-only tool → the sole registered vault, or a loud error
 *    listing the registered ids when there are 0 or >1.
 */
export function resolveVaultRef(
  args: Record<string, unknown> | undefined,
  toolName: string,
  vaults: VaultEntry[]
): string {
  const raw = args?.vault;
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();

  if (MUTATING_TOOLS.has(toolName)) {
    throw new Error(
      `${toolName} requires an explicit 'vault' argument — mutating tools never default to a vault. ` +
        `Call list_vaults to see the registered vault ids.`
    );
  }
  if (vaults.length === 1) return vaults[0].id;
  if (vaults.length === 0) {
    throw new Error(
      `${toolName}: no vaults are registered. Set VAULT_PATH, or register one with add_vault.`
    );
  }
  throw new Error(
    `${toolName}: 'vault' is required when more than one vault is registered ` +
      `(registered: ${vaults.map((v) => v.id).join(', ')}). Call list_vaults.`
  );
}

// =============================================================================
// Accept-then-match (D8) — dispatch-time payload ↔ vault-schema matching
// =============================================================================

/**
 * Match an entity-create payload against the RESOLVED vault's schema:
 *  - `type` must exist in that schema;
 *  - `status` (when provided) must be legal for that type.
 * Throws SchemaMismatch naming the vault + its valid values. Field/relationship
 * keys are matched downstream by the per-engine EntityValidator (which already
 * runs on every write path) — this covers what the validator can't reach
 * (an unknown type breaks the machinery before validation).
 */
export function assertEntityMatchesVault(
  vaultId: string,
  schema: Schema,
  payload: { type?: string; status?: string }
): void {
  if (payload.type === undefined) return;
  const typeDef = schema.entityTypes.find((t) => t.type === payload.type);
  if (!typeDef) {
    throw new SchemaMismatch(
      vaultId,
      `type '${payload.type}'`,
      schema.entityTypes.map((t) => t.type)
    );
  }
  if (
    payload.status !== undefined &&
    typeDef.statuses.length > 0 &&
    !typeDef.statuses.includes(payload.status)
  ) {
    throw new SchemaMismatch(
      vaultId,
      `status '${payload.status}' for type '${payload.type}'`,
      typeDef.statuses
    );
  }
}

// =============================================================================
// ListTools enum strategy (D8, §6.3b)
// =============================================================================

/**
 * 'schema' — exactly one registered vault: derive type/status/phase enums from
 *            its schema (the v1.9.1 behavior; trivially accept-then-match).
 * 'plain'  — 0 or >1 vaults: plain strings with descriptions pointing at
 *            get_schema({vault}). NEVER a union enum across vaults — it would
 *            imply cross-vault validity that dispatch then denies.
 */
export function selectEnumMode(vaultCount: number): 'schema' | 'plain' {
  return vaultCount === 1 ? 'schema' : 'plain';
}

// =============================================================================
// Result echo (D3) — every JSON tool result carries the resolved vault id
// =============================================================================

export function echoVault<T extends object>(vaultId: string, payload: T): { vault: string } & T {
  return { vault: vaultId, ...payload };
}
