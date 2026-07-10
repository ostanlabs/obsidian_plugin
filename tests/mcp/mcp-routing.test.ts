/**
 * tests/mcp/mcp-routing.test.ts — the W8 routing contract (spec §6.3/§6.3b,
 * D3/D8), unit-tested against src/mcp/routing.ts (extracted from mcp.ts so it
 * is reachable without booting the stdio server; the full-server behavior is
 * covered by tests/integration/mcp-stdio.test.ts).
 *
 * Covers:
 *  - required-vault enforcement per tool class (mutating vs read-only);
 *  - the single-vault read default + the >1 / 0 vault errors;
 *  - accept-then-match: SchemaMismatch for a type/status valid in vault A but
 *    not vault B (two stub engines with different schemas);
 *  - `entities` batch semantics: PER-ITEM mismatch rejection (valid siblings
 *    still succeed — no silent drop, no whole-batch abort);
 *  - result payloads echo the resolved vault id.
 */

import { describe, it, expect } from 'vitest';
import {
  MUTATING_TOOLS,
  REGISTRY_TOOLS,
  resolveVaultRef,
  assertEntityMatchesVault,
  selectEnumMode,
  echoVault,
} from '../../src/mcp/routing.js';
import { SchemaMismatch } from '../../src/mcp/types.js';
import type { VaultEntry } from '../../src/mcp/types.js';
import { DEFAULT_SCHEMA } from '../../src/entity-core/default-schema.js';
import type { Schema } from '../../src/entity-core/types.js';

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function entry(id: string): VaultEntry {
  return {
    id,
    name: id,
    path: `/vaults/${id}`,
    entitiesFolder: '',
    archiveFolder: 'archive',
    archiveLayout: 'by-type',
    canvasFolder: 'projects',
  };
}

const ONE_VAULT = [entry('alpha')];
const TWO_VAULTS = [entry('alpha'), entry('beta')];

/** Vault A's schema: the default PLUS a custom 'experiment' type, and 'task'
 * gains an extra status. Vault B runs the untouched default. */
function makeSchemaA(): Schema {
  const s: Schema = structuredClone(DEFAULT_SCHEMA);
  const task = s.entityTypes.find((t) => t.type === 'task')!;
  s.entityTypes.push({
    ...structuredClone(task),
    type: 'experiment',
    label: 'Experiment',
    idPrefix: 'X',
    folder: 'experiments',
    statuses: ['Running', 'Concluded'],
    defaultStatus: 'Running',
    fields: [],
  });
  task.statuses = [...task.statuses, 'Deferred'];
  return s;
}
const SCHEMA_A = makeSchemaA();
const SCHEMA_B: Schema = structuredClone(DEFAULT_SCHEMA);

// -----------------------------------------------------------------------------
// Tool classification
// -----------------------------------------------------------------------------

describe('tool classification', () => {
  it('pins the mutating tool set (vault hard-required, D3)', () => {
    expect([...MUTATING_TOOLS].sort()).toEqual(
      [
        'add_workspace',
        'cleanup_completed',
        'create_entity',
        'entities',
        'manage_documents',
        'rebuild_index',
        'reconcile_relationships',
        'remove_workspace',
        'set_schema',
        'update_doc',
        'update_entity',
      ].sort()
    );
  });

  it('registry-global tools take no vault at all', () => {
    expect([...REGISTRY_TOOLS].sort()).toEqual(['add_vault', 'list_vaults', 'remove_vault']);
  });
});

// -----------------------------------------------------------------------------
// resolveVaultRef — required-vault enforcement per tool class
// -----------------------------------------------------------------------------

describe('resolveVaultRef', () => {
  it('returns the explicit vault verbatim (trimmed), regardless of tool class', () => {
    expect(resolveVaultRef({ vault: 'beta' }, 'create_entity', TWO_VAULTS)).toBe('beta');
    expect(resolveVaultRef({ vault: '  alpha ' }, 'get_entity', TWO_VAULTS)).toBe('alpha');
  });

  it('EVERY mutating tool rejects a missing vault — even with exactly one vault registered', () => {
    for (const tool of MUTATING_TOOLS) {
      expect(() => resolveVaultRef({}, tool, ONE_VAULT)).toThrowError(
        new RegExp(`${tool}.*vault.*list_vaults`, 's')
      );
      // An empty string is not an explicit choice either.
      expect(() => resolveVaultRef({ vault: '  ' }, tool, ONE_VAULT)).toThrow(/list_vaults/);
    }
  });

  it('read-only tools default to the sole registered vault', () => {
    for (const tool of ['get_entity', 'list_entities', 'get_schema', 'search_docs', 'msrl_status']) {
      expect(resolveVaultRef({}, tool, ONE_VAULT)).toBe('alpha');
      expect(resolveVaultRef(undefined, tool, ONE_VAULT)).toBe('alpha');
    }
  });

  it('read-only tools error with the registered ids when >1 vault is registered', () => {
    expect(() => resolveVaultRef({}, 'get_entity', TWO_VAULTS)).toThrow(/alpha, beta/);
    expect(() => resolveVaultRef({}, 'get_entity', TWO_VAULTS)).toThrow(/vault.*required/i);
  });

  it('read-only tools error loudly when no vault is registered', () => {
    expect(() => resolveVaultRef({}, 'list_entities', [])).toThrow(/no vaults are registered/i);
    expect(() => resolveVaultRef({}, 'list_entities', [])).toThrow(/add_vault/);
  });
});

// -----------------------------------------------------------------------------
// Accept-then-match (D8) — SchemaMismatch against the RESOLVED vault's schema
// -----------------------------------------------------------------------------

describe('assertEntityMatchesVault', () => {
  it('a type valid in vault A passes on A but throws SchemaMismatch on B, naming B + its valid values', () => {
    // A knows 'experiment'…
    expect(() =>
      assertEntityMatchesVault('alpha', SCHEMA_A, { type: 'experiment' })
    ).not.toThrow();

    // …B does not: the SAME payload is rejected with vault B's identity + values.
    let caught: unknown;
    try {
      assertEntityMatchesVault('beta', SCHEMA_B, { type: 'experiment' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SchemaMismatch);
    const msg = (caught as Error).message;
    expect((caught as Error).name).toBe('SchemaMismatch');
    expect(msg).toContain(`type 'experiment'`);
    expect(msg).toContain(`vault 'beta'`);
    // Names B's valid values, and points at get_schema({vault}).
    for (const t of SCHEMA_B.entityTypes.map((t) => t.type)) expect(msg).toContain(t);
    expect(msg).toContain(`get_schema({vault: 'beta'})`);
  });

  it('a status legal in vault A but not in B throws SchemaMismatch on B only', () => {
    // 'Deferred' was added to task statuses in A only.
    expect(() =>
      assertEntityMatchesVault('alpha', SCHEMA_A, { type: 'task', status: 'Deferred' })
    ).not.toThrow();
    expect(() =>
      assertEntityMatchesVault('beta', SCHEMA_B, { type: 'task', status: 'Deferred' })
    ).toThrow(SchemaMismatch);
    try {
      assertEntityMatchesVault('beta', SCHEMA_B, { type: 'task', status: 'Deferred' });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain(`status 'Deferred' for type 'task'`);
      expect(msg).toContain(`vault 'beta'`);
      // Lists that type's legal statuses in that vault.
      const taskDef = SCHEMA_B.entityTypes.find((t) => t.type === 'task')!;
      for (const s of taskDef.statuses) expect(msg).toContain(s);
    }
  });

  it('valid type + status pass; a payload without type is left to downstream validation', () => {
    expect(() =>
      assertEntityMatchesVault('beta', SCHEMA_B, { type: 'task', status: 'Not Started' })
    ).not.toThrow();
    expect(() => assertEntityMatchesVault('beta', SCHEMA_B, {})).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// entities batch — PER-ITEM mismatch (reject the item, keep valid siblings)
// -----------------------------------------------------------------------------

describe('entities batch per-item matching', () => {
  it('rejects only the mismatching item; valid items in the same batch still succeed', () => {
    // Mirrors mcp.ts's batch loop: each op is matched individually inside its
    // own try/catch, so one SchemaMismatch never aborts or silently drops the rest.
    const ops = [
      { client_id: 'ok', type: 'task', status: 'Not Started' },
      { client_id: 'bad-type', type: 'experiment', status: undefined },
      { client_id: 'ok-2', type: 'milestone', status: undefined },
      { client_id: 'bad-status', type: 'task', status: 'Deferred' },
    ];
    const results = ops.map((op) => {
      try {
        assertEntityMatchesVault('beta', SCHEMA_B, { type: op.type, status: op.status });
        return { client_id: op.client_id, success: true };
      } catch (e) {
        return {
          client_id: op.client_id,
          success: false,
          error: (e as Error).message,
          errorName: (e as Error).name,
        };
      }
    });

    expect(results[0]).toEqual({ client_id: 'ok', success: true });
    expect(results[2]).toEqual({ client_id: 'ok-2', success: true });
    expect(results[1].success).toBe(false);
    expect(results[1].errorName).toBe('SchemaMismatch');
    expect(results[1].error).toContain(`type 'experiment'`);
    expect(results[3].success).toBe(false);
    expect(results[3].error).toContain(`status 'Deferred'`);
    // No silent drops: every op is reported.
    expect(results).toHaveLength(ops.length);
  });
});

// -----------------------------------------------------------------------------
// Enum-mode selection (D8, §6.3b)
// -----------------------------------------------------------------------------

describe('selectEnumMode', () => {
  it('derives schema enums only with exactly one registered vault', () => {
    expect(selectEnumMode(1)).toBe('schema');
  });

  it('emits plain strings for 0 or >1 vaults (never a cross-vault union enum)', () => {
    expect(selectEnumMode(0)).toBe('plain');
    expect(selectEnumMode(2)).toBe('plain');
    expect(selectEnumMode(7)).toBe('plain');
  });
});

// -----------------------------------------------------------------------------
// Result echo (D3)
// -----------------------------------------------------------------------------

describe('echoVault', () => {
  it('stamps the resolved vault id onto the result payload', () => {
    const out = echoVault('alpha', { total: 3, results: [] });
    expect(out.vault).toBe('alpha');
    expect(out.total).toBe(3);
  });

  it('never lets a payload overwrite the resolved id spot silently', () => {
    // Spread order: payload keys land AFTER vault, so a payload carrying its
    // own `vault` key wins visibly — but our payloads never carry one; this
    // pins the shape so a regression is caught here.
    const out = echoVault('alpha', { count: 1 });
    expect(Object.keys(out)[0]).toBe('vault');
  });
});
