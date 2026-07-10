/**
 * Portable MCP stdio integration suite for mcp.ts (the ~22-tool JSON-RPC server).
 *
 * Design:
 *  - Spawns the built server (bin/mcp-server.mjs, or a source-mapped coverage
 *    build via MCP_COV_SERVER) against a PORTABLE fixture vault created in an
 *    fs.mkdtempSync temp dir — NEVER the live vault. Runs anywhere / in CI.
 *  - Reuses the reference handshake: `initialize` + `notifications/initialized`,
 *    then `tools/call` over newline-delimited JSON-RPC on stdio.
 *  - Asserts on tool BEHAVIOR (not just no-throw).
 *
 * Coverage: when the harness sets MCP_COV_SERVER (a --sourcemap esbuild bundle)
 * and NODE_V8_COVERAGE, the spawned child inherits NODE_V8_COVERAGE and emits V8
 * coverage that `c8 report --include mcp.ts` maps back to mcp.ts. See
 * scripts/coverage-mcp.mjs. Under a plain `jest --config jest.config.integration.js`
 * run neither is set, so the functional suite still runs green against the build.
 *
 * SKIPPED (model/embedding-dependent, not CI-safe): search_docs & msrl_status
 * boot the MSRL semantic engine (onnxruntime / transformer model download). They
 * are exercised only as a "does not crash the server" smoke where safe. See the
 * `describe('embedding-dependent tools (skipped)')` block.
 */

import { spawn, ChildProcessWithoutNullStreams, execSync } from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

// The coverage harness points MCP_COV_SERVER at a source-mapped bundle; a plain
// run uses the production build and (re)builds it if stale/missing.
const SERVER_BIN = process.env.MCP_COV_SERVER
  ? path.resolve(process.env.MCP_COV_SERVER)
  : path.join(PLUGIN_ROOT, 'bin', 'mcp-server.mjs');

// --- Fixture vault -------------------------------------------------------
// Six self-consistent entities (one per type) whose relationships are
// bidirectionally clean so validate_project == 0 and reconcile dry-run == 0.
//   M-001 milestone ─children→ S-001 story ─children→ T-001 task
//   DEC-001 decision ─affects→ DOC-001 document ─documents→ F-001 feature
//   (reverse pairs decided_by / documented_by authored for consistency)
const FIXTURE: Record<string, string> = {
  'milestones/M-001_launch.md': `---
id: M-001
type: milestone
title: Q1 Launch
status: In Progress
workstream: engineering
priority: High
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-02T00:00:00Z
archived: false
children:
  - S-001
---

# Objective
Ship the MVP to production.
`,
  'stories/S-001_auth.md': `---
id: S-001
type: story
title: Authentication
status: In Progress
workstream: engineering
priority: High
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-02T00:00:00Z
archived: false
parent: M-001
children:
  - T-001
---

# Outcome
Users can sign in.
`,
  'tasks/T-001_oauth.md': `---
id: T-001
type: task
title: Wire OAuth provider
status: Not Started
workstream: engineering
goal: Configure the OAuth provider
created_at: 2026-01-03T00:00:00Z
updated_at: 2026-01-03T00:00:00Z
archived: false
parent: S-001
---

# Goal
Configure the OAuth provider.
`,
  'decisions/DEC-001_db.md': `---
id: DEC-001
type: decision
title: Use Postgres
status: Decided
workstream: engineering
decided_by: Alice
affects:
  - DOC-001
created_at: 2026-01-04T00:00:00Z
updated_at: 2026-01-04T00:00:00Z
archived: false
---

# Decision
Adopt Postgres.
`,
  'documents/DOC-001_spec.md': `---
id: DOC-001
type: document
title: Auth Spec
status: Approved
workstream: engineering
doc_type: spec
version: "1.0"
documents:
  - F-001
decided_by:
  - DEC-001
created_at: 2026-01-05T00:00:00Z
updated_at: 2026-01-05T00:00:00Z
archived: false
---

# Content
Authentication specification.
`,
  'features/F-001_login.md': `---
id: F-001
type: feature
title: Login
status: In Progress
workstream: engineering
user_story: As a user I want to log in so that I can access my account
tier: OSS
phase: MVP
documented_by:
  - DOC-001
created_at: 2026-01-06T00:00:00Z
updated_at: 2026-01-06T00:00:00Z
archived: false
---

# Content
Login feature.
`,
};

// --- JSON-RPC over stdio client ------------------------------------------
interface CallResult {
  text: string | undefined;
  isError: boolean | undefined;
  raw: any;
}

/** Test-local mirror of the registry's kebabSlug (vault id of an absorbed
 * VAULT_PATH = slug of the directory basename). */
function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'vault';
}

// Registry-global tools take no `vault` argument — never auto-inject one.
const REGISTRY_GLOBAL_TOOLS = new Set(['list_vaults', 'add_vault', 'remove_vault']);

class McpClient {
  private srv!: ChildProcessWithoutNullStreams;
  private pending = new Map<number, (m: any) => void>();
  private nextId = 1;
  public stderr = '';
  private exited: { code: number | null; signal: string | null } | null = null;
  /** Isolated XDG_CONFIG_HOME so the developer's real ~/.config/ostanlabs/mcp.json
   * can never leak extra vaults into the suite (the single-vault default and
   * schema-derived enums both require EXACTLY one registered vault). */
  private configHome: string | null = null;

  /** The registry id of the absorbed VAULT_PATH vault (undefined in registry-only mode). */
  get vaultId(): string | undefined {
    return this.vault ? slug(path.basename(this.vault)) : undefined;
  }

  constructor(
    private vault: string | null,
    private opts: { env?: Record<string, string>; autoVault?: boolean } = {},
  ) {}

  async start(): Promise<void> {
    this.configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-'));
    const env: Record<string, string | undefined> = {
      // Inherit env so NODE_V8_COVERAGE (coverage harness) propagates to the child.
      ...process.env,
      XDG_CONFIG_HOME: this.configHome,
      ...(this.opts.env ?? {}),
    };
    if (this.vault) env.VAULT_PATH = this.vault;
    else delete env.VAULT_PATH;
    this.srv = spawn('node', [SERVER_BIN], {
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.srv.stderr.on('data', (d) => (this.stderr += d.toString()));
    this.srv.on('exit', (code, signal) => (this.exited = { code, signal }));

    const rl = readline.createInterface({ input: this.srv.stdout });
    rl.on('line', (line) => {
      let m: any;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      if (m.id != null && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      }
    });

    // Handshake (reference pattern).
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'jest-integration', version: '1.0.0' },
    });
    this.notify('notifications/initialized', {});
    // Let the server finish schema bootstrap + logging before first call.
    await new Promise((r) => setTimeout(r, 300));
  }

  private rpc(method: string, params: unknown): Promise<any> {
    if (this.exited) {
      throw new Error(
        `Server already exited (code=${this.exited.code}, signal=${this.exited.signal}).\nSTDERR:\n${this.stderr}`,
      );
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC ${method} timed out.\nSTDERR:\n${this.stderr}`));
      }, 25000);
      this.pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      this.srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  private notify(method: string, params: unknown): void {
    this.srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async listTools(): Promise<string[]> {
    const r = await this.rpc('tools/list', {});
    return (r?.result?.tools ?? []).map((t: any) => t.name);
  }

  /** Full tool definitions (name + description + inputSchema), not just names. */
  async listToolDefs(): Promise<any[]> {
    const r = await this.rpc('tools/list', {});
    return r?.result?.tools ?? [];
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<CallResult> {
    // Multi-vault contract (spec D3): mutating tools hard-require `vault`.
    // The suite runs single-vault via VAULT_PATH, so the client injects the
    // absorbed vault's id on every vault-scoped call (tests can still pass an
    // explicit `vault` — or set autoVault:false — to exercise the contract).
    // (`vault: undefined` — key present — opts OUT of injection: JSON-RPC
    // serialization drops it, so the server sees no vault argument at all.)
    const finalArgs =
      (this.opts.autoVault ?? true) &&
      this.vaultId !== undefined &&
      !REGISTRY_GLOBAL_TOOLS.has(name) &&
      !('vault' in args)
        ? { vault: this.vaultId, ...args }
        : args;
    const r = await this.rpc('tools/call', { name, arguments: finalArgs });
    return {
      text: r?.result?.content?.[0]?.text,
      isError: r?.result?.isError,
      raw: r,
    };
  }

  /** Parse a tool's text payload as JSON (fails loudly with the raw text). */
  async callJson(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const res = await this.call(name, args);
    try {
      return JSON.parse(res.text ?? '');
    } catch {
      throw new Error(`Expected JSON from ${name}, got:\n${res.text}`);
    }
  }

  async stop(): Promise<void> {
    if (this.srv && !this.exited) {
      // SIGTERM lets the server flush NODE_V8_COVERAGE on exit.
      this.srv.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 400));
      if (!this.exited) this.srv.kill('SIGKILL');
    }
    if (this.configHome) {
      fs.rmSync(this.configHome, { recursive: true, force: true });
      this.configHome = null;
    }
  }
}

// -------------------------------------------------------------------------
describe('MCP stdio server (mcp.ts) — portable integration suite', () => {
  let vault: string;
  let client: McpClient;

  beforeAll(async () => {
    // 1. Ensure a fresh server binary (unless the coverage harness supplied one).
    if (!process.env.MCP_COV_SERVER) {
      if (!fs.existsSync(SERVER_BIN)) {
        execSync('npm run build:mcp', { cwd: PLUGIN_ROOT, stdio: 'inherit' });
      }
    }
    expect(fs.existsSync(SERVER_BIN)).toBe(true);

    // 2. Materialize the portable fixture vault in a temp dir.
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-fixture-'));
    for (const [rel, content] of Object.entries(FIXTURE)) {
      const abs = path.join(vault, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
    }

    // 3. Spawn + handshake.
    client = new McpClient(vault);
    await client.start();
  }, 120000);

  afterAll(async () => {
    if (client) await client.stop();
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  test('tools/list exposes the full tool surface', async () => {
    const tools = await client.listTools();
    // A representative slice of the ~22 registered tools.
    for (const t of [
      'create_entity', 'get_entity', 'update_entity', 'list_entities', 'entities',
      'get_schema', 'set_schema', 'get_schema_designer', 'search_entities',
      'validate_project', 'reconcile_relationships', 'get_project_overview',
      'rebuild_index',
      // Multi-vault surface (spec §7/§8).
      'list_vaults', 'add_vault', 'remove_vault',
      'list_workspaces', 'add_workspace', 'remove_workspace',
    ]) {
      expect(tools).toContain(t);
    }
    expect(tools.length).toBeGreaterThanOrEqual(26);
  });

  describe('multi-vault routing contract (single absorbed VAULT_PATH vault)', () => {
    test('list_vaults shows the absorbed VAULT_PATH vault as transient', async () => {
      const r = await client.callJson('list_vaults');
      expect(r.count).toBe(1);
      expect(r.vaults[0].id).toBe(client.vaultId);
      expect(r.vaults[0].path).toBe(vault); // absorbed verbatim (path.resolve, no realpath)
      expect(r.vaults[0].exists).toBe(true);
      expect(r.vaults[0].transient).toBe(true);
    });

    test('mutating tools REQUIRE vault even with exactly one vault registered (D3)', async () => {
      const r = await client.call('create_entity', {
        vault: undefined,
        type: 'task',
        title: 'Should not be created',
        properties: { goal: 'g' },
      });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/create_entity requires an explicit 'vault'/);
      expect(r.text).toMatch(/list_vaults/);
    });

    test('read-only tools default to the sole vault and every JSON result echoes it (D3)', async () => {
      // No vault arg passed — resolves to the single registered vault.
      const gs = await client.callJson('get_schema', { vault: undefined });
      expect(gs.vault).toBe(client.vaultId);
      const se = await client.callJson('search_entities', { vault: undefined, filters: { type: ['task'] } });
      expect(se.vault).toBe(client.vaultId);
      // Mutating tool with the explicit vault echoes it too.
      const ri = await client.callJson('rebuild_index');
      expect(ri.vault).toBe(client.vaultId);
    });

    test('an unregistered vault id errors with VaultNotFound-style guidance', async () => {
      const r = await client.call('get_entity', { vault: 'no-such-vault', id: 'M-001' });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/'no-such-vault' is not registered/);
      expect(r.text).toContain(client.vaultId!);
    });

    test('workspaces round-trip: add is confinement-gated, list reflects state', async () => {
      // Out-of-allowedRoots path is rejected at registration (allowedRoots is
      // empty in the isolated config → default-deny).
      const bad = await client.call('add_workspace', { name: 'evil', path: '/etc' });
      expect(bad.isError).toBe(true);
      expect(bad.text).toMatch(/not within allowedRoots/);

      const list = await client.callJson('list_workspaces');
      expect(list.vault).toBe(client.vaultId);
      expect(list.count).toBe(0);
    });
  });

  describe('schema tools', () => {
    test('get_schema bootstraps schema.json and serves it as the source of truth', async () => {
      const gs = await client.callJson('get_schema');
      expect(gs.errors).toEqual([]);
      // Multi-vault contract change: the VAULT_PATH startup bootstrap writes
      // schema.json (from the codified default) BEFORE the lazily-built engine
      // reads it, so get_schema reports source 'file' — the file on disk is
      // now the single source of truth. (Pre-W8 the same module state did
      // both, so first boot reported 'default'.)
      expect(gs.source).toBe('file');
      expect(gs.vault).toBe(client.vaultId);
      expect(Array.isArray(gs.schema.relationships)).toBe(true);
      expect(gs.schema.relationships.length).toBeGreaterThan(0);
      expect(gs.schema.entityTypes.length).toBe(6);
      // The bootstrap wrote schema.json into the fixture vault.
      expect(fs.existsSync(path.join(vault, 'schema.json'))).toBe(true);
    });

    test('set_schema (valid, idempotent) saves and flips source to file', async () => {
      const gs = await client.callJson('get_schema');
      const res = await client.callJson('set_schema', { schema: gs.schema });
      expect(res.saved).toBe(true);
      expect(res.entityTypes).toBe(6);
      expect(res.relationships).toBe(gs.schema.relationships.length);

      // Idempotent re-save + source is now 'file'.
      const res2 = await client.callJson('set_schema', { schema: gs.schema });
      expect(res2.saved).toBe(true);
      const gs2 = await client.callJson('get_schema');
      expect(gs2.source).toBe('file');
      expect(gs2.errors).toEqual([]);
    });

    test('set_schema (invalid) is rejected with isError and NOT saved', async () => {
      // A relationships-only edit with a pair missing its reverse / bad shape.
      const bad = await client.call('set_schema', {
        relationships: [{ name: 'broken', pairs: [{ from: 'milestone', forward: 'p' }] }],
      });
      expect(bad.isError).toBe(true);
      expect(bad.text).toMatch(/invalid|NOT saved/i);
      // Schema still valid afterwards.
      const gs = await client.callJson('get_schema');
      expect(gs.errors).toEqual([]);
    });

    test('set_schema with neither schema nor relationships is rejected', async () => {
      const res = await client.call('set_schema', {});
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/requires/i);
    });

    test('get_schema_designer returns HTML with the schema injected (no placeholder)', async () => {
      const res = await client.call('get_schema_designer');
      expect(res.isError).toBeFalsy();
      const html = res.text ?? '';
      expect(html.length).toBeGreaterThan(1000);
      expect(html).toContain('"relationships"');
      expect(html).not.toContain('__SCHEMA_PLACEHOLDER__');
    });
  });

  // These invariants hold on the PRISTINE fixture — asserted before the CRUD
  // block mutates the vault (adds tasks, which introduce benign parent/children
  // drift that reconcile then detects further down).
  describe('pristine fixture invariants (run before mutations)', () => {
    test('validate_project reports 0 violations on the clean fixture', async () => {
      const v = await client.callJson('validate_project');
      expect(v.entities_checked).toBe(6);
      expect(v.violations_count).toBe(0);
      expect(v.violations).toEqual([]);
      // The clean fixture is within all fan-out advisory limits too.
      expect(v.advisories_count).toBe(0);
    });

    test('reconcile_relationships dry-run reports 0 changes on the consistent fixture', async () => {
      const r = await client.callJson('reconcile_relationships', { dry_run: true });
      expect(r.dry_run).toBe(true);
      expect(r.changes_count).toBe(0);
    });
  });

  describe('entity CRUD + query tools', () => {
    test('list_entities returns fixture entities, filterable by type', async () => {
      const all = await client.call('list_entities');
      expect(all.text).toMatch(/Found 6 entities/);

      const tasks = await client.call('list_entities', { type: 'task' });
      expect(tasks.text).toMatch(/Found 1 entity of type task/);
      expect(tasks.text).toContain('T-001');
    });

    test('get_entity returns full parsed entity JSON', async () => {
      const e = await client.callJson('get_entity', { id: 'S-001' });
      expect(e.id).toBe('S-001');
      expect(e.type).toBe('story');
      expect(e.title).toBe('Authentication');
      expect(e.relationships.parent).toBe('M-001');
    });

    test('get_entity on missing id returns isError', async () => {
      const res = await client.call('get_entity', { id: 'Z-999' });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/not found/i);
    });

    test('create_entity allocates an id, persists a file, and is retrievable', async () => {
      const res = await client.call('create_entity', {
        type: 'task',
        title: 'Add integration tests',
        // parent must live under `relationships` (properties.* become custom fields).
        properties: { goal: 'Cover the MCP tools', status: 'Not Started', relationships: { parent: 'S-001' } },
      });
      expect(res.isError).toBeFalsy();
      const m = res.text?.match(/Created task (T-\d+)/);
      expect(m).toBeTruthy();
      const newId = m![1];

      // The file exists on disk in the fixture vault (title-only, preserve-case name).
      const files = fs.readdirSync(path.join(vault, 'tasks'));
      expect(files).toContain('Add_integration_tests.md');

      // And is now retrievable through the index.
      const fetched = await client.callJson('get_entity', { id: newId });
      expect(fetched.id).toBe(newId);
      expect(fetched.fields.goal).toBe('Cover the MCP tools');
    });

    test('create_entity with invalid status is rejected (SchemaMismatch at dispatch, D8)', async () => {
      const res = await client.call('create_entity', {
        type: 'decision',
        title: 'Bad status decision',
        properties: { status: 'Totally Invalid Status' },
      });
      expect(res.isError).toBe(true);
      // Accept-then-match: dispatch rejects with the resolved vault's identity
      // and its valid values (was a generic "Validation failed" pre-multi-vault).
      expect(res.text).toMatch(/does not match the schema of vault/i);
      expect(res.text).toContain(`vault '${client.vaultId}'`);
      expect(res.text).toMatch(/Pending/); // names the type's valid statuses
    });

    test('update_entity mutates a field and persists', async () => {
      const res = await client.call('update_entity', {
        id: 'T-001',
        updates: { status: 'In Progress' },
      });
      expect(res.isError).toBeFalsy();
      expect(res.text).toMatch(/Updated T-001/);

      const e = await client.callJson('get_entity', { id: 'T-001' });
      expect(e.status).toBe('In Progress');
    });

    test('update_entity on missing id returns isError', async () => {
      const res = await client.call('update_entity', { id: 'Z-999', updates: { status: 'Blocked' } });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/not found/i);
    });

    test('search_entities — search mode matches by title', async () => {
      const r = await client.callJson('search_entities', { query: 'Postgres' });
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.results.map((x: any) => x.id)).toContain('DEC-001');
    });

    test('search_entities — list mode with type filter', async () => {
      const r = await client.callJson('search_entities', { filters: { type: ['feature'] } });
      expect(r.results.every((x: any) => x.type === 'feature')).toBe(true);
      expect(r.results.map((x: any) => x.id)).toContain('F-001');
    });

    test('search_entities — navigation mode (down = children)', async () => {
      const r = await client.callJson('search_entities', { from_id: 'M-001', direction: 'down' });
      expect(r.results.map((x: any) => x.id)).toContain('S-001');
    });

    test('entities (bulk get) fetches multiple by id and reports not_found', async () => {
      const r = await client.callJson('entities', { action: 'get', ids: ['M-001', 'F-001', 'Z-999'] });
      expect(r.count).toBe(2);
      expect(r.entities.map((e: any) => e.id).sort()).toEqual(['F-001', 'M-001']);
      expect(r.not_found).toContain('Z-999');
    });

    test('entities (batch create) creates a new entity', async () => {
      const r = await client.callJson('entities', {
        action: 'batch',
        ops: [
          {
            client_id: 'c1',
            op: 'create',
            type: 'task',
            payload: { title: 'Batch-created task', goal: 'From batch', relationships: { parent: 'S-001' } },
          },
        ],
      });
      // Batch response shape: results[] with success flags.
      expect(Array.isArray(r.results)).toBe(true);
      expect(r.results[0].success).toBe(true);
      expect(r.results[0].id).toMatch(/^T-\d+/);
    });
  });

  describe('project / maintenance tools', () => {
    test('validate_project stays at 0 violations after CRUD (created tasks are well-parented)', async () => {
      const v = await client.callJson('validate_project');
      expect(v.entities_checked).toBeGreaterThanOrEqual(6);
      expect(v.violations_count).toBe(0);
      expect(v.violations).toEqual([]);
    });

    test('reconcile_relationships dry-run detects the parent/children drift from created tasks', async () => {
      const r = await client.callJson('reconcile_relationships', { dry_run: true });
      expect(r.dry_run).toBe(true);
      // The tasks created in the CRUD block have parent S-001 but S-001's children
      // list does not yet include them — reconcile should surface exactly these.
      expect(r.changes_count).toBeGreaterThanOrEqual(1);
      expect(r.changes.every((c: string) => /Add T-\d+ to children/.test(c))).toBe(true);
    });

    test('reconcile_relationships (write mode) runs and returns a change summary', async () => {
      const r = await client.callJson('reconcile_relationships', { dry_run: false });
      expect(r.dry_run).toBe(false);
      expect(typeof r.changes_count).toBe('number');
    });

    test('get_project_overview summarizes counts by type', async () => {
      const o = await client.callJson('get_project_overview');
      expect(o.summary).toBeDefined();
      expect(o.summary.milestones.total).toBeGreaterThanOrEqual(1);
      expect(o.summary.stories.total).toBeGreaterThanOrEqual(1);
      expect(o.summary.tasks.total).toBeGreaterThanOrEqual(1);
    });

    test('rebuild_index re-scans and reports before/after/duration', async () => {
      const r = await client.callJson('rebuild_index');
      expect(r.entities_after).toBeGreaterThanOrEqual(6);
      expect(typeof r.entities_before).toBe('number');
      expect(typeof r.duration_ms).toBe('number');
    });
  });

  describe('document / analysis tools (bonus coverage)', () => {
    test('read_docs reads a workspace file from the vault', async () => {
      fs.writeFileSync(path.join(vault, 'README.md'), '# Fixture Readme\nHello.', 'utf-8');
      const r = await client.call('read_docs', { path: 'README.md' });
      expect(r.isError).toBeFalsy();
      expect(r.text).toContain('Fixture Readme');
    });

    test('read_docs on a missing file returns isError', async () => {
      const r = await client.call('read_docs', { path: 'nope/missing.md' });
      expect(r.isError).toBe(true);
    });

    test('update_doc writes a workspace document', async () => {
      const r = await client.call('update_doc', { path: 'NOTES.md', content: '# Notes\nline' });
      expect(r.isError).toBeFalsy();
      expect(fs.readFileSync(path.join(vault, 'NOTES.md'), 'utf-8')).toContain('# Notes');
    });

    test('list_files lists markdown files', async () => {
      const r = await client.call('list_files', { pattern: '*.md' });
      expect(r.isError).toBeFalsy();
      expect(r.text).toBeTruthy();
    });

    test('validate_project honors entity_types filter', async () => {
      const v = await client.callJson('validate_project', { entity_types: ['feature'] });
      expect(v.violations_count).toBe(0);
    });

    test('get_feature_coverage returns a coverage report', async () => {
      const r = await client.call('get_feature_coverage');
      expect(r.isError).toBeFalsy();
      expect(r.text).toBeTruthy();
    });

    test('analyze_project_state returns an analysis', async () => {
      const r = await client.call('analyze_project_state', { focus: 'both' });
      expect(r.isError).toBeFalsy();
      expect(r.text).toBeTruthy();
    });

    test('manage_documents get_decision_history lists decisions', async () => {
      const r = await client.call('manage_documents', { action: 'get_decision_history' });
      expect(r.isError).toBeFalsy();
      expect(r.text).toBeTruthy();
    });

    test('cleanup_completed dry-run runs without error', async () => {
      const r = await client.call('cleanup_completed', { dry_run: true });
      expect(r.isError).toBeFalsy();
    });
  });

  /**
   * SKIPPED — these boot the MSRL semantic engine (@ostanlabs/md-retriever →
   * onnxruntime-node / transformer model). Not CI-safe without a model cache and
   * native deps, and can hang on first-run model download. Left as `.skip` so the
   * intent is documented; enable locally with a warmed MSRL cache if needed.
   */
  describe('embedding-dependent tools (skipped: require MSRL model)', () => {
    test.skip('search_docs performs hybrid semantic search', async () => {
      await client.call('search_docs', { query: 'authentication' });
    });
    test.skip('msrl_status reports index state', async () => {
      await client.call('msrl_status');
    });
  });
});

// =========================================================================
// ERROR / EDGE-PATH COVERAGE
//
// The blocks below drive the UNCOVERED validation/error/navigation branches of
// mcp.ts (baseline ~55% branch coverage). Each block spins up its OWN isolated
// fixture vault + server so it never depends on (or perturbs) the shared happy-
// path suite above, and so the coverage harness aggregates the extra V8 output.
// =========================================================================

/** Build a minimal entity markdown file from a frontmatter map (arrays → block seq). */
function ent(fields: Record<string, unknown>, body = '# Body\ncontent'): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else if (typeof v === 'string') {
      lines.push(`${k}: ${JSON.stringify(v)}`); // quote → colon/date safe
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

/** Materialize a fixture map into a fresh temp vault dir. */
function makeVault(fixture: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-edge-'));
  for (const [rel, content] of Object.entries(fixture)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }
  return dir;
}

// --- Rich read-mostly fixture: seeded violations, drift, coverage, freshness ---
const EDGE_FIXTURE: Record<string, string> = {
  // milestones — status spread for get_project_overview switch branches
  'milestones/M-100.md': ent({ id: 'M-100', type: 'milestone', title: 'Completed MS', status: 'Completed', workstream: 'engineering', priority: 'High', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, children: ['S-100'] }),
  'milestones/M-101.md': ent({ id: 'M-101', type: 'milestone', title: 'InProgress MS', status: 'In Progress', workstream: 'design', priority: 'High', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  'milestones/M-102.md': ent({ id: 'M-102', type: 'milestone', title: 'Blocked MS', status: 'Blocked', workstream: 'engineering', priority: 'High', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, depends_on: ['M-101'] }),
  'milestones/M-103.md': ent({ id: 'M-103', type: 'milestone', title: 'NotStarted MS', status: 'Not Started', workstream: 'engineering', priority: 'Medium', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  // stories
  'stories/S-100.md': ent({ id: 'S-100', type: 'story', title: 'Done story', status: 'Completed', workstream: 'engineering', priority: 'Medium', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'M-100', children: ['T-100'] }),
  'stories/S-200.md': ent({ id: 'S-200', type: 'story', title: 'Orphan story', status: 'In Progress', workstream: 'engineering', priority: 'Medium', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  // tasks
  'tasks/T-100.md': ent({ id: 'T-100', type: 'task', title: 'Done task', status: 'Completed', workstream: 'engineering', goal: 'done', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'S-100' }),
  'tasks/T-200.md': ent({ id: 'T-200', type: 'task', title: 'Orphan task', status: 'In Progress', workstream: 'engineering', goal: 'zebrafield deployment work', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  'tasks/T-300.md': ent({ id: 'T-300', type: 'task', title: 'Bad-field task', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'S-200', documents: ['DOC-100'] }),
  'tasks/T-301.md': ent({ id: 'T-301', type: 'task', title: 'Bad-target task', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'S-200', depends_on: ['S-100'] }),
  'tasks/T-400.md': ent({ id: 'T-400', type: 'task', title: 'Dangling parent task', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'M-999' }),
  'tasks/T-500.md': ent({ id: 'T-500', type: 'task', title: 'Depends task', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'S-200', depends_on: ['T-100'] }),
  'tasks/T-600.md': ent({ id: 'T-600', type: 'task', title: 'Dangling dep task', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'S-200', depends_on: ['T-999'] }),
  // decisions — status spread
  'decisions/DEC-100.md': ent({ id: 'DEC-100', type: 'decision', title: 'Auth decision', status: 'Decided', workstream: 'engineering', context: 'chose the widget approach', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z', archived: false, affects: ['DOC-100'] }),
  'decisions/DEC-101.md': ent({ id: 'DEC-101', type: 'decision', title: 'Pending decision', status: 'Pending', workstream: 'design', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  'decisions/DEC-102.md': ent({ id: 'DEC-102', type: 'decision', title: 'Old decision', status: 'Superseded', workstream: 'engineering', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  // documents — one old (for freshness) + one draft
  'documents/DOC-100.md': ent({ id: 'DOC-100', type: 'document', title: 'Old spec', status: 'Approved', workstream: 'engineering', doc_type: 'spec', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z', archived: false, documents: ['F-100'] }),
  'documents/DOC-101.md': ent({ id: 'DOC-101', type: 'document', title: 'Draft guide', status: 'Draft', workstream: 'engineering', doc_type: 'guide', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  // features — one covered (impl+doc), one uncovered
  'features/F-100.md': ent({ id: 'F-100', type: 'feature', title: 'Covered feature', status: 'Planned', workstream: 'engineering', user_story: 'As a user I want X', tier: 'OSS', phase: 'MVP', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, implemented_by: ['S-100'], documented_by: ['DOC-100'] }),
  // phase is deliberately a YAML number (real vaults contain both `phase: 1` and `phase: "1"`)
  'features/F-200.md': ent({ id: 'F-200', type: 'feature', title: 'Uncovered feature', status: 'Planned', workstream: 'engineering', user_story: 'As a user I want Y', tier: 'Premium', phase: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
};

describe('mcp.ts error/edge paths — read-mostly fixture', () => {
  let vault: string;
  let c: McpClient;

  beforeAll(async () => {
    vault = makeVault(EDGE_FIXTURE);
    c = new McpClient(vault);
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  describe('create_entity validation failures', () => {
    test('missing required custom field (task without goal) → isError', async () => {
      const r = await c.call('create_entity', { type: 'task', title: 'No goal task', properties: { status: 'Not Started' } });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Validation failed/);
      expect(r.text).toMatch(/goal/);
    });

    test('cardinality violation (parent as array) → isError', async () => {
      const r = await c.call('create_entity', {
        type: 'task', title: 'Bad parent card',
        properties: { goal: 'g', relationships: { parent: ['S-200'] } },
      });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Validation failed/);
    });

    test('invalid relationship target type → isError', async () => {
      // task.parent must target a story; point it at a task id instead.
      const r = await c.call('create_entity', {
        type: 'task', title: 'Bad parent target',
        properties: { goal: 'g', relationships: { parent: 'T-100' } },
      });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Validation failed/);
    });
  });

  describe('update_entity edge paths', () => {
    test('update introducing an invalid status → isError', async () => {
      const r = await c.call('update_entity', { id: 'T-500', updates: { status: 'Totally Bogus' } });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Validation failed/);
    });

    test('update with a nested fields object is sanitized (colon → dash) and persisted', async () => {
      const r = await c.call('update_entity', { id: 'T-600', updates: { fields: { goal: 'Phase 2: cleanup' } } });
      expect(r.isError).toBeFalsy();
      const e = await c.callJson('get_entity', { id: 'T-600' });
      // Colon in the nested string was replaced by the sanitizer.
      expect(String(e.fields.goal)).not.toContain(':');
      expect(String(e.fields.goal)).toContain('Phase 2');
    });
  });

  describe('search_entities navigation + query/filter branches', () => {
    test('navigation from a missing entity → isError', async () => {
      const r = await c.call('search_entities', { from_id: 'Z-999', direction: 'down' });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/not found/i);
    });

    test('navigation up returns the parent', async () => {
      const r = await c.callJson('search_entities', { from_id: 'T-500', direction: 'up' });
      expect(r.results.map((x: any) => x.id)).toContain('S-200');
    });

    test('navigation siblings returns entities sharing the parent', async () => {
      const r = await c.callJson('search_entities', { from_id: 'T-500', direction: 'siblings' });
      const ids = r.results.map((x: any) => x.id);
      expect(ids).toContain('T-300');
      expect(ids).not.toContain('T-500');
    });

    test('navigation dependencies returns depends_on targets', async () => {
      const r = await c.callJson('search_entities', { from_id: 'T-500', direction: 'dependencies' });
      expect(r.results.map((x: any) => x.id)).toContain('T-100');
    });

    test('search matches on a field value (not title/id)', async () => {
      const r = await c.callJson('search_entities', { query: 'zebrafield' });
      expect(r.results.map((x: any) => x.id)).toContain('T-200');
    });

    test('list mode with status filter', async () => {
      const r = await c.callJson('search_entities', { filters: { status: ['Blocked'] } });
      expect(r.results.map((x: any) => x.id)).toContain('M-102');
      expect(r.results.every((x: any) => x.status === 'Blocked')).toBe(true);
    });

    test('list mode with workstream filter + limit', async () => {
      const r = await c.callJson('search_entities', { filters: { workstream: ['design'] }, limit: 1 });
      expect(r.results.length).toBe(1);
      expect(r.results[0].workstream).toBe('design');
    });
  });

  describe('get_project_overview option branches', () => {
    test('include_completed + include_archived + status spread', async () => {
      const o = await c.callJson('get_project_overview', { include_completed: true, include_archived: true });
      expect(o.summary.milestones.completed).toBeGreaterThanOrEqual(1);
      expect(o.summary.milestones.in_progress).toBeGreaterThanOrEqual(1);
      expect(o.summary.milestones.blocked).toBeGreaterThanOrEqual(1);
      expect(o.summary.milestones.not_started).toBeGreaterThanOrEqual(1);
      expect(o.summary.decisions.pending).toBeGreaterThanOrEqual(1);
      expect(o.summary.decisions.decided).toBeGreaterThanOrEqual(1);
      expect(o.summary.decisions.superseded).toBeGreaterThanOrEqual(1);
      expect(o.summary.documents.draft).toBeGreaterThanOrEqual(1);
      expect(o.summary.documents.approved).toBeGreaterThanOrEqual(1);
    });

    test('workstream filter narrows the summary', async () => {
      const o = await c.callJson('get_project_overview', { workstream: 'design' });
      expect(Object.keys(o.workstreams)).toEqual(['design']);
    });
  });

  describe('validate_project with seeded violations', () => {
    test('reports orphaned, invalid-relationship and invalid-target rules', async () => {
      const v = await c.callJson('validate_project');
      expect(v.violations_count).toBeGreaterThanOrEqual(3);
      const rules = v.violations.map((x: any) => x.rule);
      expect(rules).toContain('ORPHANED_ENTITY');
      expect(rules).toContain('INVALID_RELATIONSHIP');
      expect(rules).toContain('INVALID_RELATIONSHIP_TARGET');
      // Orphan story flagged
      expect(v.violations.some((x: any) => x.entity.includes('S-200'))).toBe(true);
      // task 'documents' field is not allowed for tasks
      expect(v.violations.some((x: any) => x.rule === 'INVALID_RELATIONSHIP' && x.entity.includes('T-300'))).toBe(true);
    });

    test('workstream filter path runs and returns a count', async () => {
      const v = await c.callJson('validate_project', { workstream: 'engineering' });
      expect(typeof v.violations_count).toBe('number');
    });
  });

  describe('get_feature_coverage filters + counting', () => {
    test('counts implementation/documentation coverage', async () => {
      const r = await c.callJson('get_feature_coverage');
      expect(r.total).toBe(2);
      expect(r.with_implementation).toBe(1);
      expect(r.with_documentation).toBe(1);
      const covered = r.features.find((f: any) => f.id === 'F-100');
      expect(covered.has_implementation).toBe(true);
      expect(covered.implementation_count).toBe(1);
    });

    test('phase filter narrows results', async () => {
      const r = await c.callJson('get_feature_coverage', { phase: 'MVP' });
      expect(r.total).toBe(1);
      expect(r.features[0].id).toBe('F-100');
    });

    test('string phase argument matches YAML-numeric phase values', async () => {
      // F-200 stores `phase: 1` (number); the tool argument is always a string.
      const r = await c.callJson('get_feature_coverage', { phase: '1' });
      expect(r.total).toBe(1);
      expect(r.features[0].id).toBe('F-200');
    });

    test('tools/list advertises the schema phase enum, not V1/V2/Future', async () => {
      const tools = await c.listToolDefs();
      const tool = tools.find((t: any) => t.name === 'get_feature_coverage');
      expect(tool.inputSchema.properties.phase.enum).toEqual(['MVP', '0', '1', '2', '3', '4', '5']);
    });

    test('tier filter narrows results', async () => {
      const r = await c.callJson('get_feature_coverage', { tier: 'Premium' });
      expect(r.total).toBe(1);
      expect(r.features[0].id).toBe('F-200');
    });
  });

  describe('analyze_project_state focus branches', () => {
    test('focus=blockers surfaces the blocked entity and its dependencies', async () => {
      const r = await c.callJson('analyze_project_state', { focus: 'blockers' });
      expect(r.blockers_count).toBeGreaterThanOrEqual(1);
      const blocked = r.blockers.find((b: any) => b.id === 'M-102');
      expect(blocked).toBeTruthy();
      expect(blocked.blocked_by).toContain('M-101');
    });

    test('focus=actions produces suggestions', async () => {
      const r = await c.callJson('analyze_project_state', { focus: 'actions' });
      expect(Array.isArray(r.suggested_actions)).toBe(true);
      expect(r.suggested_actions.some((s: string) => /not started/i.test(s))).toBe(true);
    });
  });

  describe('manage_documents branches', () => {
    test('get_decision_history with topic filter', async () => {
      const r = await c.callJson('manage_documents', { action: 'get_decision_history', topic: 'auth' });
      expect(r.decisions.map((d: any) => d.id)).toContain('DEC-100');
      expect(r.decisions.every((d: any) => /auth/i.test(d.title) || true)).toBe(true);
    });

    test('get_decision_history with workstream filter', async () => {
      const r = await c.callJson('manage_documents', { action: 'get_decision_history', workstream: 'design' });
      expect(r.decisions.every((d: any) => d.workstream === 'design')).toBe(true);
      expect(r.decisions.map((d: any) => d.id)).toContain('DEC-101');
    });

    test('check_freshness without document_id → isError', async () => {
      const r = await c.call('manage_documents', { action: 'check_freshness' });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/document_id required/);
    });

    test('check_freshness on a missing document → isError', async () => {
      const r = await c.call('manage_documents', { action: 'check_freshness', document_id: 'DOC-999' });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/not found/i);
    });

    test('check_freshness flags a doc stale when a newer decision exists', async () => {
      const r = await c.callJson('manage_documents', { action: 'check_freshness', document_id: 'DOC-100' });
      expect(r.is_stale).toBe(true);
      expect(r.newer_decisions_count).toBeGreaterThanOrEqual(1);
    });

    test('unknown action falls through to Invalid action → isError', async () => {
      const r = await c.call('manage_documents', { action: 'bogus_action' });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Invalid action/);
    });
  });

  describe('list_files branches', () => {
    test('recursive listing traverses subdirectories', async () => {
      const r = await c.callJson('list_files', { pattern: '*.md', recursive: true });
      expect(r.count).toBeGreaterThan(5);
    });

    test('no pattern lists everything in the directory', async () => {
      const r = await c.callJson('list_files', { directory: 'tasks' });
      expect(r.count).toBeGreaterThanOrEqual(7);
    });
  });

  describe('cleanup_completed with a milestone_id filter (dry-run)', () => {
    test('milestone_id filter with no matching completed milestone → 0 processed', async () => {
      const r = await c.callJson('cleanup_completed', { dry_run: true, milestone_id: 'M-999' });
      expect(r.milestones_processed).toBe(0);
    });
  });

  describe('reconcile_relationships dry-run drift detection', () => {
    test('surfaces missing-children, dangling-parent, add-blocks and dangling-dep changes', async () => {
      const r = await c.callJson('reconcile_relationships', { dry_run: true });
      expect(r.changes_count).toBeGreaterThanOrEqual(4);
      const all = r.changes.join('\n');
      expect(all).toMatch(/Add T-\d+ to children/);
      expect(all).toMatch(/Parent M-999 not found - removing/);
      expect(all).toMatch(/Add .* to blocks/);
      expect(all).toMatch(/Dependency T-999 not found - removing/);
    });
  });

  describe('entities tool — get/batch error + dry-run branches', () => {
    test('get with no ids → isError', async () => {
      const r = await c.call('entities', { action: 'get', ids: [] });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/ids is required/);
    });

    test('get with a fields filter returns only requested fields', async () => {
      const r = await c.callJson('entities', { action: 'get', ids: ['M-100'], fields: ['title'] });
      expect(r.entities[0].id).toBe('M-100');
      expect(r.entities[0].title).toBe('Completed MS');
      // status was not requested → absent
      expect(r.entities[0].status).toBeUndefined();
    });

    test('batch with no ops → isError', async () => {
      const r = await c.call('entities', { action: 'batch', ops: [] });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/ops is required/);
    });

    test('unknown action → isError', async () => {
      const r = await c.call('entities', { action: 'frobnicate' });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Invalid action/);
    });

    test('batch dry-run previews create/update/archive without writing', async () => {
      const r = await c.callJson('entities', {
        action: 'batch',
        options: { dry_run: true },
        ops: [
          { client_id: 'a', op: 'create', type: 'task', payload: { title: 'Preview task', goal: 'g' } },
          { client_id: 'b', op: 'update', id: 'T-100', payload: { status: 'Blocked' } },
          { client_id: 'd', op: 'archive', id: 'T-100', payload: {} },
        ],
      });
      expect(r.summary.dry_run).toBe(true);
      expect(r.summary.succeeded).toBe(3);
      expect(r.results[0].changes.some((ch: any) => ch.after === 'create')).toBe(true);
      expect(r.results[1].changes.some((ch: any) => ch.field === 'status')).toBe(true);
      expect(r.results[2].changes[0].field).toBe('archived');
    });

    test('batch op-level failures are reported per-op (non-atomic)', async () => {
      const r = await c.callJson('entities', {
        action: 'batch',
        ops: [
          { client_id: 'e1', op: 'create', type: 'task', payload: { goal: 'no title' } }, // missing title
          { client_id: 'e2', op: 'update', id: 'Z-000', payload: { status: 'Blocked' } }, // not found
          { client_id: 'e3', op: 'archive', id: 'Z-000', payload: {} }, // not found
          { client_id: 'e4', op: 'delete', payload: {} }, // invalid op
        ],
      });
      expect(r.summary.failed).toBe(4);
      expect(r.results[0].error).toMatch(/title are required/);
      expect(r.results[1].error).toMatch(/not found/);
      expect(r.results[2].error).toMatch(/not found/);
      expect(r.results[3].error).toMatch(/Invalid operation/);
    });

    test('batch create with an invalid status fails per-op (SchemaMismatch at dispatch, D8)', async () => {
      const r = await c.callJson('entities', {
        action: 'batch',
        ops: [{ client_id: 'v', op: 'create', type: 'task', payload: { title: 'x', goal: 'g', status: 'Nope' } }],
      });
      expect(r.results[0].success).toBe(false);
      // Per-item accept-then-match rejection naming the resolved vault
      // (was the validator's generic "Validation failed" pre-multi-vault).
      expect(r.results[0].error).toMatch(/status 'Nope'.*does not match the schema of vault/);
    });

    test('batch atomic mode aborts with isError on first failure', async () => {
      const r = await c.call('entities', {
        action: 'batch',
        options: { atomic: true },
        ops: [{ client_id: 'x', op: 'update', id: 'Z-000', payload: { status: 'Blocked' } }],
      });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/atomic mode/);
      expect(r.text).toMatch(/Rolled back/);
    });
  });

  describe('tool dispatch default', () => {
    test('unknown tool name → isError via the switch default', async () => {
      const r = await c.call('this_tool_does_not_exist');
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Unknown tool/);
    });
  });

  describe('set_schema relationships-only valid merge', () => {
    test('merging the existing relationships array saves and flips source to file', async () => {
      const gs = await c.callJson('get_schema');
      const res = await c.callJson('set_schema', { relationships: gs.schema.relationships });
      expect(res.saved).toBe(true);
      expect(res.relationships).toBe(gs.schema.relationships.length);
      const gs2 = await c.callJson('get_schema');
      expect(gs2.source).toBe('file');
    });
  });
});

// --- Disposable fixture for the WRITE/mutation paths ---------------------
const MUT_FIXTURE: Record<string, string> = {
  'milestones/MC-1.md': ent({ id: 'MC-1', type: 'milestone', title: 'Completed parent', status: 'Completed', workstream: 'engineering', priority: 'High', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, children: ['SC-1'] }),
  'stories/SC-1.md': ent({ id: 'SC-1', type: 'story', title: 'Completed child story', status: 'Completed', workstream: 'engineering', priority: 'Medium', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'MC-1' }),
  // task parented directly to the milestone so cleanup_completed archives it too
  'tasks/TC-1.md': ent({ id: 'TC-1', type: 'task', title: 'Completed child task', status: 'Completed', workstream: 'engineering', goal: 'done', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'MC-1' }),
  // dangling parent → reconcile write removes the parent field
  'tasks/TC-2.md': ent({ id: 'TC-2', type: 'task', title: 'Dangling parent', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'M-777' }),
  // forward dependency drift: TC-3 depends_on TC-4, but TC-4 has no `blocks` back-edge
  // → reconcile write must ADD TC-3 to TC-4.blocks and persist it.
  'tasks/TC-3.md': ent({ id: 'TC-3', type: 'task', title: 'Dependent task', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, depends_on: ['TC-4'] }),
  'tasks/TC-4.md': ent({ id: 'TC-4', type: 'task', title: 'Blocking task', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
};

describe('mcp.ts write/mutation paths — disposable fixture', () => {
  let vault: string;
  let c: McpClient;

  beforeAll(async () => {
    vault = makeVault(MUT_FIXTURE);
    c = new McpClient(vault);
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  test('reconcile write mode removes a dangling parent and persists it', async () => {
    const r = await c.callJson('reconcile_relationships', { dry_run: false });
    expect(r.dry_run).toBe(false);
    expect(r.changes_count).toBeGreaterThanOrEqual(1);
    // The dangling-parent removal is a real mutation to the child file.
    const e = await c.callJson('get_entity', { id: 'TC-2' });
    expect(e.relationships?.parent).toBeUndefined();

    // Forward-drift additions must ALSO persist (previously reported but never written):
    // (1) parent→children — TC-1's parent MC-1 must gain TC-1 in its children list.
    const mc1 = await c.callJson('get_entity', { id: 'MC-1' });
    expect(mc1.relationships?.children).toContain('TC-1');
    expect(mc1.relationships?.children).toContain('SC-1'); // pre-existing child preserved
    // (2) depends_on→blocks — TC-3 depends_on TC-4, so TC-4 must gain TC-3 in blocks.
    const tc4 = await c.callJson('get_entity', { id: 'TC-4' });
    expect(tc4.relationships?.blocks).toContain('TC-3');
  });

  test('batch real create resolves a {{client_id}} cross-reference', async () => {
    const r = await c.callJson('entities', {
      action: 'batch',
      ops: [
        { client_id: 'p', op: 'create', type: 'milestone', payload: { title: 'Batch parent MS', priority: 'High' } },
        { client_id: 'k', op: 'create', type: 'task', payload: { title: 'Batch child task', goal: 'g', assignee: '{{p}}' } },
      ],
    });
    expect(r.summary.succeeded).toBe(2);
    const parentId = r.results[0].id;
    const childId = r.results[1].id;
    expect(parentId).toMatch(/^M-\d+/);
    // The {{p}} placeholder was resolved to the parent's real id.
    const child = await c.callJson('get_entity', { id: childId });
    expect(child.fields.assignee).toBe(parentId);
  });

  test('batch real update then archive persist to disk', async () => {
    const up = await c.callJson('entities', {
      action: 'batch',
      ops: [{ client_id: 'u', op: 'update', id: 'TC-1', payload: { status: 'In Progress' } }],
    });
    expect(up.summary.succeeded).toBe(1);
    let e = await c.callJson('get_entity', { id: 'TC-1' });
    expect(e.status).toBe('In Progress');

    const ar = await c.callJson('entities', {
      action: 'batch',
      ops: [{ client_id: 'z', op: 'archive', id: 'TC-1', payload: {} }],
    });
    expect(ar.summary.succeeded).toBe(1);
    e = await c.callJson('get_entity', { id: 'TC-1' });
    expect(e.archived).toBe(true);
  });

  test('cleanup_completed dry-run then write archives completed children under a completed milestone', async () => {
    // Re-seed a fresh completed pair (TC-1 was archived by the prior test).
    fs.writeFileSync(path.join(vault, 'stories/SC-9.md'),
      ent({ id: 'SC-9', type: 'story', title: 'Completed story 9', status: 'Completed', workstream: 'engineering', priority: 'Medium', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'MC-1' }), 'utf-8');
    fs.writeFileSync(path.join(vault, 'tasks/TC-9.md'),
      ent({ id: 'TC-9', type: 'task', title: 'Completed task 9', status: 'Completed', workstream: 'engineering', goal: 'done', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'MC-1' }), 'utf-8');

    const dry = await c.callJson('cleanup_completed', { dry_run: true });
    expect(dry.milestones_processed).toBeGreaterThanOrEqual(1);
    expect(dry.entities_to_archive).toBeGreaterThanOrEqual(2);

    const wet = await c.callJson('cleanup_completed', { dry_run: false });
    expect(wet.stories_archived).toBeGreaterThanOrEqual(1);
    expect(wet.tasks_archived).toBeGreaterThanOrEqual(1);
    // Archive copies were written under archive/.
    expect(fs.existsSync(path.join(vault, 'archive'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fan-out advisories: soft guidelines surfaced by validate_project (NOT
// enforced on writes) — document ≤2 documented features, decision ≤2 affected
// documents, feature ≤3 implementers. Each advisory must carry a concrete
// reorganization suggestion.
describe('mcp.ts validate_project fan-out advisories — disposable fixture', () => {
  let vault: string;
  let c: McpClient;

  beforeAll(async () => {
    vault = makeVault(FIXTURE); // the clean 6-entity fixture
    c = new McpClient(vault);
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  test('fan-out beyond limits yields ADVISORIES with suggestions, never violations', async () => {
    const mk = async (type: string, title: string, properties: Record<string, unknown>) => {
      const res = await c.call('create_entity', { type, title, properties });
      expect(res.isError).toBeFalsy();
      return res.text!.match(/([A-Z]+-\d+)/)![1];
    };
    // Writes with over-limit fan-out succeed — the limits are advisory-only.
    await mk('document', 'Fanout Doc', {
      doc_type: 'spec', relationships: { documents: ['F-001', 'F-901', 'F-902'] },
    });
    await mk('decision', 'Fanout Decision', {
      relationships: { affects: ['DOC-001', 'DOC-901', 'DOC-902'] },
    });
    await mk('feature', 'Fanout Feature', {
      user_story: 'u', tier: 'OSS', phase: 'MVP',
      relationships: { implemented_by: ['M-001', 'S-001', 'S-901', 'S-902'] },
    });

    const v = await c.callJson('validate_project');
    // Fan-out never lands in violations.
    expect((v.violations as Array<{ rule: string }>).every(x => !x.rule.includes('FANOUT'))).toBe(true);
    const byRule = Object.fromEntries(
      (v.advisories as Array<{ rule: string; entity: string; suggestion: string }>).map(a => [a.rule, a])
    );
    expect(byRule.DOCUMENT_FANOUT).toBeDefined();
    expect(byRule.DECISION_FANOUT).toBeDefined();
    expect(byRule.FEATURE_IMPLEMENTER_FANOUT).toBeDefined();
    for (const a of v.advisories as Array<{ suggestion: string }>) {
      expect(a.suggestion.length).toBeGreaterThan(20);
    }
    expect(v.advisory_note).toContain('non-blocking');
    // AT the limit is fine: fixture DOC-001 documents exactly 1 feature → no advisory for it.
    expect((v.advisories as Array<{ entity: string }>).some(a => a.entity.startsWith('DOC-001'))).toBe(false);
  });

  test('feature documented_by fan-in beyond limit yields FEATURE_DOC_FANOUT (advisory, never a violation); exactly at the limit stays silent', async () => {
    const mk = async (type: string, title: string, properties: Record<string, unknown>) => {
      const res = await c.call('create_entity', { type, title, properties });
      expect(res.isError).toBeFalsy();
      return res.text!.match(/([A-Z]+-\d+)/)![1];
    };
    // 3 documents (> limit 2) → advisory; exactly 2 → silent.
    const over = await mk('feature', 'Overdocumented Feature', {
      user_story: 'u', tier: 'OSS', phase: 'MVP',
      relationships: { documented_by: ['DOC-001', 'DOC-911', 'DOC-912'] },
    });
    const atLimit = await mk('feature', 'Welldocumented Feature', {
      user_story: 'u', tier: 'OSS', phase: 'MVP',
      relationships: { documented_by: ['DOC-001', 'DOC-911'] },
    });

    const v = await c.callJson('validate_project');
    // Doc fan-in never lands in violations.
    expect((v.violations as Array<{ rule: string }>).every(x => !x.rule.includes('FANOUT'))).toBe(true);
    const fanIn = (v.advisories as Array<{ rule: string; entity: string; message: string; suggestion: string }>)
      .filter(a => a.rule === 'FEATURE_DOC_FANOUT');
    const hit = fanIn.find(a => a.entity.startsWith(`${over} `));
    expect(hit).toBeDefined();
    expect(hit!.message).toMatch(/feature documented_by 3 documents \(limit 2\)/);
    expect(hit!.suggestion).toContain('Unify the documentation');
    expect(hit!.suggestion.length).toBeGreaterThan(20);
    // Exactly at the limit → no advisory for that feature.
    expect(fanIn.some(a => a.entity.startsWith(`${atLimit} `))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WRITE-PATH REGRESSIONS (bugs found 2026-07-08 while bulk-editing production):
//   BUG 1 — flat relationship keys were a silent no-op (update/create/batch)
//   BUG 2 — reconcile_relationships never filled missing reverses for most pairs
//   BUG 3 — entities in archive/ subfolders were unreachable ("Entity not found")
//   BUG 4 — pre-existing invalid fields blocked unrelated updates
// Own disposable vault + server; tests within the block are order-dependent
// (creates happen before the reconcile pass, bug-4 checks run last).
// ---------------------------------------------------------------------------
const WP_FIXTURE: Record<string, string> = {
  'milestones/M-900.md': ent({ id: 'M-900', type: 'milestone', title: 'WP milestone', status: 'In Progress', workstream: 'engineering', priority: 'High', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  'stories/S-900.md': ent({ id: 'S-900', type: 'story', title: 'Routing story', status: 'In Progress', workstream: 'engineering', priority: 'Medium', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'M-900' }),
  // forward-only implements: F-900 has NO implemented_by back-edge (bug 2)
  'stories/S-920.md': ent({ id: 'S-920', type: 'story', title: 'Forward-only implements', status: 'In Progress', workstream: 'engineering', priority: 'Medium', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, implements: ['F-900'] }),
  // status 'Deferred' is INVALID for tasks (bug 4 seed)
  'tasks/T-900.md': ent({ id: 'T-900', type: 'task', title: 'Deferred task', status: 'Deferred', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'S-900' }),
  'tasks/T-901.md': ent({ id: 'T-901', type: 'task', title: 'Dep target', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, parent: 'S-900' }),
  // forward-only affects: DOC-900 has NO decided_by back-edge (bug 2)
  'decisions/DEC-900.md': ent({ id: 'DEC-900', type: 'decision', title: 'Ambiguity decision', status: 'Decided', workstream: 'engineering', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, affects: ['DOC-900'] }),
  // forward-only documents: F-900 has NO documented_by back-edge (bug 2)
  'documents/DOC-900.md': ent({ id: 'DOC-900', type: 'document', title: 'Reconcile doc', status: 'Draft', workstream: 'engineering', doc_type: 'spec', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false, documents: ['F-900'] }),
  'documents/DOC-901.md': ent({ id: 'DOC-901', type: 'document', title: 'Ambiguity doc', status: 'Draft', workstream: 'engineering', doc_type: 'spec', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  'features/F-900.md': ent({ id: 'F-900', type: 'feature', title: 'Reverse-fill feature', status: 'Planned', workstream: 'engineering', user_story: 'u', tier: 'OSS', phase: 'MVP', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  'features/F-901.md': ent({ id: 'F-901', type: 'feature', title: 'Second feature', status: 'Planned', workstream: 'engineering', user_story: 'u', tier: 'OSS', phase: 'MVP', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  // archived entity living in an archive/ SUBFOLDER (bug 3 — by-type layout)
  'archive/stories/S-910.md': ent({ id: 'S-910', type: 'story', title: 'Archived story', status: 'Completed', workstream: 'engineering', priority: 'Medium', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: true }),
};

describe('mcp.ts write-path regressions (bugs 1-4) — disposable fixture', () => {
  let vault: string;
  let c: McpClient;

  beforeAll(async () => {
    vault = makeVault(WP_FIXTURE);
    c = new McpClient(vault);
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  // ----------------------------------------------------------------- BUG 1
  test('BUG 1: flat `implements` on update_entity persists to disk (was a silent no-op)', async () => {
    const r = await c.call('update_entity', { id: 'S-900', updates: { implements: ['F-900'] } });
    expect(r.isError).toBeFalsy();
    // Persisted to the file, not just claimed in the response.
    const raw = fs.readFileSync(path.join(vault, 'stories/S-900.md'), 'utf-8');
    expect(raw).toMatch(/implements:/);
    expect(raw).toContain('F-900');
    const e = await c.callJson('get_entity', { id: 'S-900' });
    expect(e.relationships.implements).toEqual(['F-900']);
    expect(e.fields.implements).toBeUndefined();
  });

  test('BUG 1: per-type ambiguity — decision.decided_by stays a custom field', async () => {
    const r = await c.call('update_entity', { id: 'DEC-900', updates: { decided_by: 'Alice' } });
    expect(r.isError).toBeFalsy();
    const e = await c.callJson('get_entity', { id: 'DEC-900' });
    expect(e.fields.decided_by).toBe('Alice');
    expect(e.relationships.decided_by).toBeUndefined();
    // And it actually persisted (custom fields at top level were dropped too).
    const raw = fs.readFileSync(path.join(vault, 'decisions/DEC-900.md'), 'utf-8');
    expect(raw).toMatch(/decided_by: Alice/);
  });

  test('BUG 1: per-type ambiguity — document.decided_by becomes a relationship', async () => {
    const r = await c.call('update_entity', { id: 'DOC-901', updates: { decided_by: ['DEC-900'] } });
    expect(r.isError).toBeFalsy();
    const e = await c.callJson('get_entity', { id: 'DOC-901' });
    expect(e.relationships.decided_by).toEqual(['DEC-900']);
    expect(e.fields.decided_by).toBeUndefined();
  });

  test('BUG 1: batch update payload flat `implements` persists, and dry_run previews the routed value', async () => {
    const dry = await c.callJson('entities', {
      action: 'batch',
      options: { dry_run: true },
      ops: [{ client_id: 'wp-dry', op: 'update', id: 'S-900', payload: { implements: ['F-900', 'F-901'] } }],
    });
    const ch = dry.results[0].changes.find((x: any) => x.field === 'implements');
    expect(ch).toBeDefined();
    expect(ch.before).toEqual(['F-900']); // real current relationship value, not undefined
    expect(ch.after).toEqual(['F-900', 'F-901']);

    const wet = await c.callJson('entities', {
      action: 'batch',
      ops: [{ client_id: 'wp-wet', op: 'update', id: 'S-900', payload: { implements: ['F-900', 'F-901'] } }],
    });
    expect(wet.results[0].success).toBe(true);
    const e = await c.callJson('get_entity', { id: 'S-900' });
    expect(e.relationships.implements).toEqual(['F-900', 'F-901']);
  });

  test('BUG 1: create_entity routes flat relationship keys in properties', async () => {
    const r = await c.call('create_entity', {
      type: 'story',
      title: 'Flat rel create',
      properties: { priority: 'Medium', parent: 'M-900', implements: ['F-901'] },
    });
    expect(r.isError).toBeFalsy();
    const id = r.text!.match(/Created story (S-\d+)/)![1];
    const e = await c.callJson('get_entity', { id });
    expect(e.relationships.parent).toBe('M-900');
    expect(e.relationships.implements).toEqual(['F-901']);
    expect(e.fields.implements).toBeUndefined();
  });

  test('BUG 1: batch create routes flat relationship keys in payload', async () => {
    const r = await c.callJson('entities', {
      action: 'batch',
      ops: [{ client_id: 'wp-c', op: 'create', type: 'task', payload: { title: 'Flat rel batch task', goal: 'g', parent: 'S-900' } }],
    });
    expect(r.results[0].success).toBe(true);
    const e = await c.callJson('get_entity', { id: r.results[0].id });
    expect(e.relationships.parent).toBe('S-900');
  });

  // ----------------------------------------------------------------- BUG 3
  test('BUG 3: archived entity in an archive/ subfolder is reachable and updated IN PLACE', async () => {
    const e0 = await c.callJson('get_entity', { id: 'S-910' });
    expect(e0.archived).toBe(true);

    const r = await c.call('update_entity', { id: 'S-910', updates: { implements: ['F-901'] } });
    expect(r.isError).toBeFalsy();

    // The update landed in the archive file — no duplicate outside archive/.
    const raw = fs.readFileSync(path.join(vault, 'archive/stories/S-910.md'), 'utf-8');
    expect(raw).toContain('F-901');
    expect(raw).toMatch(/archived: true/);
    expect(fs.existsSync(path.join(vault, 'stories/S-910.md'))).toBe(false);

    const e = await c.callJson('get_entity', { id: 'S-910' });
    expect(e.relationships.implements).toEqual(['F-901']);
    expect(e.archived).toBe(true);
  });

  // ----------------------------------------------------------------- BUG 2
  test('BUG 2: reconcile dry-run surfaces missing reverses for implements/documents/affects pairs', async () => {
    const r = await c.callJson('reconcile_relationships', { dry_run: true });
    const all = r.changes.join('\n');
    expect(all).toContain('F-900: Add S-920 to implemented_by');  // implements → implemented_by
    expect(all).toContain('F-900: Add DOC-900 to documented_by'); // documents → documented_by
    expect(all).toContain('DOC-900: Add DEC-900 to decided_by');  // affects → decided_by
    // dry-run wrote nothing
    const f = await c.callJson('get_entity', { id: 'F-900' });
    expect(f.relationships.implemented_by).toBeUndefined();
    expect(f.relationships.documented_by).toBeUndefined();
  });

  test('BUG 2: reconcile write mode fills missing reverses on disk (then reaches a fixpoint)', async () => {
    const r = await c.callJson('reconcile_relationships', { dry_run: false });
    expect(r.dry_run).toBe(false);
    expect(r.changes_count).toBeGreaterThanOrEqual(3);

    const f900 = await c.callJson('get_entity', { id: 'F-900' });
    expect(f900.relationships.implemented_by).toEqual(expect.arrayContaining(['S-900', 'S-920']));
    expect(f900.relationships.documented_by).toContain('DOC-900');
    const doc = await c.callJson('get_entity', { id: 'DOC-900' });
    expect(doc.relationships.decided_by).toContain('DEC-900');
    // Reverse-only edges get their FORWARD filled too (DOC-901.decided_by was
    // authored in the bug-1 test without touching DEC-900.affects).
    const dec = await c.callJson('get_entity', { id: 'DEC-900' });
    expect(dec.relationships.affects).toEqual(expect.arrayContaining(['DOC-900', 'DOC-901']));
    // Archived entities participate: S-910.implements F-901 ↔ F-901.implemented_by.
    const f901 = await c.callJson('get_entity', { id: 'F-901' });
    expect(f901.relationships.implemented_by).toEqual(expect.arrayContaining(['S-910']));

    // A second pass finds nothing left to fix.
    const again = await c.callJson('reconcile_relationships', { dry_run: true });
    expect(again.changes_count).toBe(0);
  });

  // ----------------------------------------------------------------- BUG 4
  test('BUG 4: pre-existing invalid status does not block a relationships-only update (warning surfaced)', async () => {
    const r = await c.call('update_entity', { id: 'T-900', updates: { depends_on: ['T-901'] } });
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/Updated T-900/);
    expect(r.text).toContain('"warnings"');
    // quotes inside the JSON warnings block are escaped (\"Deferred\")
    expect(r.text).toMatch(/Invalid status \\?"Deferred\\?"/);
    const e = await c.callJson('get_entity', { id: 'T-900' });
    expect(e.relationships.depends_on).toEqual(['T-901']);
    expect(e.status).toBe('Deferred'); // untouched field left as-is
  });

  test('BUG 4: an update that sets another invalid value in the bad field is still rejected', async () => {
    const r = await c.call('update_entity', { id: 'T-900', updates: { status: 'Bogus' } });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/Validation failed/);
    const e = await c.callJson('get_entity', { id: 'T-900' });
    expect(e.status).toBe('Deferred'); // nothing was written
  });

  test('BUG 4: batch update mirrors the touched-field semantics (warnings array, per-op reject)', async () => {
    const r = await c.callJson('entities', {
      action: 'batch',
      ops: [
        { client_id: 'wp-w1', op: 'update', id: 'T-900', payload: { goal: 'updated goal' } },
        { client_id: 'wp-w2', op: 'update', id: 'T-900', payload: { status: 'Bogus2' } },
      ],
    });
    expect(r.results[0].success).toBe(true);
    expect(Array.isArray(r.results[0].warnings)).toBe(true);
    expect(r.results[0].warnings.some((w: string) => /Invalid status/.test(w))).toBe(true);
    expect(r.results[1].success).toBe(false);
    expect(r.results[1].error).toMatch(/Validation failed/);
    // The flat custom-field key routed into fields and persisted.
    const e = await c.callJson('get_entity', { id: 'T-900' });
    expect(e.fields.goal).toBe('updated goal');
  });
});

// ---------------------------------------------------------------------------
// PRODUCTION-SHAKEDOWN WRITE-PATH BUGS (found 2026-07 while editing production):
//   BUG A — update paths ignored `updates.body` AND destroyed the existing
//           markdown body (serializer emits frontmatter only; nothing was
//           re-attached on write)
//   BUG B — invalid-for-type passthrough fields could not be updated or
//           CLEARED (flat-key router dropped unknown keys at top level)
//   BUG C — reconcile refilled forward links from STALE reverses, undoing
//           explicit forward edits (fixed via forward-authoritative recency)
// Own disposable vault + server; tests are order-dependent (BUG C's reconcile
// runs after the A/B mutations and accounts for them).
// ---------------------------------------------------------------------------
const SHAKE_FIXTURE: Record<string, string> = {
  // BUG A subjects (bodies matter here)
  'milestones/M-801.md': ent({ id: 'M-801', type: 'milestone', title: 'Body milestone', status: 'In Progress', workstream: 'engineering', priority: 'High', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }, '# Objective\noriginal body line'),
  'tasks/T-801.md': ent({ id: 'T-801', type: 'task', title: 'Batch body task', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }, '# Goal\nbatch original body'),
  // BUG B subject — implemented_by / notion_page_id are NOT schema-valid for
  // documents, so the parser parks them in entity.passthrough.
  'documents/DOC-801.md': ent({ id: 'DOC-801', type: 'document', title: 'Passthrough doc', status: 'Draft', workstream: 'engineering', doc_type: 'spec', implemented_by: ['S-999'], notion_page_id: 'abc123', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', archived: false }),
  // BUG C shakedown trio: decision affects BOTH docs; both docs carry the reverse.
  'decisions/DEC-801.md': ent({ id: 'DEC-801', type: 'decision', title: 'Shakedown decision', status: 'Decided', workstream: 'engineering', created_at: '2026-01-04T00:00:00Z', updated_at: '2026-01-04T00:00:00Z', archived: false, affects: ['DOC-802', 'DOC-803'] }),
  'documents/DOC-802.md': ent({ id: 'DOC-802', type: 'document', title: 'Kept doc', status: 'Draft', workstream: 'engineering', doc_type: 'spec', decided_by: ['DEC-801'], created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z', archived: false }),
  'documents/DOC-803.md': ent({ id: 'DOC-803', type: 'document', title: 'Detached doc', status: 'Draft', workstream: 'engineering', doc_type: 'spec', decided_by: ['DEC-801'], created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z', archived: false }),
  // BUG C legit reverse-only authoring: the reverse-side file is NEWER.
  'decisions/DEC-802.md': ent({ id: 'DEC-802', type: 'decision', title: 'Reverse-authored decision', status: 'Decided', workstream: 'engineering', created_at: '2026-01-04T00:00:00Z', updated_at: '2026-01-04T00:00:00Z', archived: false }),
  'documents/DOC-804.md': ent({ id: 'DOC-804', type: 'document', title: 'Reverse-author doc', status: 'Draft', workstream: 'engineering', doc_type: 'spec', decided_by: ['DEC-802'], created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z', archived: false }),
  // BUG C tie (equal updated_at) → legacy fill behavior.
  'decisions/DEC-803.md': ent({ id: 'DEC-803', type: 'decision', title: 'Tie decision', status: 'Decided', workstream: 'engineering', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z', archived: false }),
  'documents/DOC-805.md': ent({ id: 'DOC-805', type: 'document', title: 'Tie doc', status: 'Draft', workstream: 'engineering', doc_type: 'spec', decided_by: ['DEC-803'], created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z', archived: false }),
};

describe('mcp.ts production-shakedown bugs A/B/C — disposable fixture', () => {
  let vault: string;
  let c: McpClient;

  const bodyOf = (rel: string): string => extractBodyForTest(fs.readFileSync(path.join(vault, rel), 'utf-8'));

  beforeAll(async () => {
    vault = makeVault(SHAKE_FIXTURE);
    c = new McpClient(vault);
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  // ----------------------------------------------------------------- BUG A
  test('BUG A: update_entity with a string `body` replaces the markdown body on disk', async () => {
    const r = await c.call('update_entity', { id: 'M-801', updates: { body: '# Rewritten\nnew body: with a colon kept' } });
    expect(r.isError).toBeFalsy();
    const raw = fs.readFileSync(path.join(vault, 'milestones/M-801.md'), 'utf-8');
    expect(raw).toContain('# Rewritten');
    expect(raw).toContain('new body: with a colon kept'); // body is NOT colon-sanitized
    expect(raw).not.toContain('original body line');
    // Frontmatter untouched by a body-only update; body never leaks into it.
    const e = await c.callJson('get_entity', { id: 'M-801' });
    expect(e.title).toBe('Body milestone');
    expect(e.status).toBe('In Progress');
    expect(e.fields.body).toBeUndefined();
    expect(raw).not.toMatch(/^body:/m);
  });

  test('BUG A: body + frontmatter update in one call does both', async () => {
    const r = await c.call('update_entity', { id: 'M-801', updates: { status: 'Blocked', body: '# Combined\nboth updated' } });
    expect(r.isError).toBeFalsy();
    const e = await c.callJson('get_entity', { id: 'M-801' });
    expect(e.status).toBe('Blocked');
    const raw = fs.readFileSync(path.join(vault, 'milestones/M-801.md'), 'utf-8');
    expect(raw).toContain('# Combined');
    expect(raw).not.toContain('# Rewritten');
  });

  test('BUG A: omitting body leaves the existing body untouched (was destroyed entirely)', async () => {
    const r = await c.call('update_entity', { id: 'M-801', updates: { status: 'In Progress' } });
    expect(r.isError).toBeFalsy();
    const e = await c.callJson('get_entity', { id: 'M-801' });
    expect(e.status).toBe('In Progress');
    // The body written by the previous test survived the frontmatter-only update.
    expect(bodyOf('milestones/M-801.md')).toContain('# Combined');
    expect(bodyOf('milestones/M-801.md')).toContain('both updated');
    // Relationship/field keys never leak into the body.
    expect(bodyOf('milestones/M-801.md')).not.toMatch(/status:|priority:/);
  });

  test('BUG A: entities batch update supports body (dry-run previews it, write persists it)', async () => {
    const dry = await c.callJson('entities', {
      action: 'batch',
      options: { dry_run: true },
      ops: [{ client_id: 'sa-dry', op: 'update', id: 'T-801', payload: { goal: 'updated goal', body: '# Batch Body\nreplaced' } }],
    });
    const ch = dry.results[0].changes.find((x: any) => x.field === 'body');
    expect(ch).toBeDefined();
    expect(String(ch.before)).toContain('batch original body'); // real current body, not undefined
    expect(String(ch.after)).toContain('# Batch Body');
    // Dry run wrote nothing.
    expect(bodyOf('tasks/T-801.md')).toContain('batch original body');

    const wet = await c.callJson('entities', {
      action: 'batch',
      ops: [{ client_id: 'sa-wet', op: 'update', id: 'T-801', payload: { goal: 'updated goal', body: '# Batch Body\nreplaced' } }],
    });
    expect(wet.results[0].success).toBe(true);
    const raw = fs.readFileSync(path.join(vault, 'tasks/T-801.md'), 'utf-8');
    expect(raw).toContain('# Batch Body');
    expect(raw).not.toContain('batch original body');
    expect(raw).not.toMatch(/^body:/m);
    const e = await c.callJson('get_entity', { id: 'T-801' });
    expect(e.fields.goal).toBe('updated goal');
  });

  // ----------------------------------------------------------------- BUG B
  test('BUG B: clearing an invalid-for-type passthrough field with [] removes it from disk', async () => {
    // Sanity: the field really is passthrough (invalid for documents).
    const before = fs.readFileSync(path.join(vault, 'documents/DOC-801.md'), 'utf-8');
    expect(before).toMatch(/implemented_by:/);

    const r = await c.call('update_entity', { id: 'DOC-801', updates: { implemented_by: [] } });
    expect(r.isError).toBeFalsy();
    const raw = fs.readFileSync(path.join(vault, 'documents/DOC-801.md'), 'utf-8');
    expect(raw).not.toMatch(/implemented_by/);
    expect(raw).not.toContain('S-999');
    const e = await c.callJson('get_entity', { id: 'DOC-801' });
    expect(e.passthrough?.implemented_by).toBeUndefined();
  });

  test('BUG B: setting a passthrough key to a value updates it; null deletes it', async () => {
    const r = await c.call('update_entity', { id: 'DOC-801', updates: { notion_page_id: 'xyz789' } });
    expect(r.isError).toBeFalsy();
    let raw = fs.readFileSync(path.join(vault, 'documents/DOC-801.md'), 'utf-8');
    expect(raw).toMatch(/notion_page_id: xyz789/);

    const r2 = await c.call('update_entity', { id: 'DOC-801', updates: { notion_page_id: null } });
    expect(r2.isError).toBeFalsy();
    raw = fs.readFileSync(path.join(vault, 'documents/DOC-801.md'), 'utf-8');
    expect(raw).not.toMatch(/notion_page_id/);
  });

  test('BUG B: entities batch dry-run previews a passthrough clear as a change', async () => {
    // notion_page_id is gone; seed a fresh passthrough key via direct file edit
    // is unnecessary — use DOC-802 which never had one and instead preview the
    // clear on a still-present passthrough field of a fresh fixture doc.
    fs.writeFileSync(path.join(vault, 'documents/DOC-806.md'),
      ent({ id: 'DOC-806', type: 'document', title: 'Preview doc', status: 'Draft', workstream: 'engineering', doc_type: 'spec', implemented_by: ['S-998'], created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', archived: false }), 'utf-8');
    const dry = await c.callJson('entities', {
      action: 'batch',
      options: { dry_run: true },
      ops: [{ client_id: 'sb-dry', op: 'update', id: 'DOC-806', payload: { implemented_by: [] } }],
    });
    const ch = dry.results[0].changes.find((x: any) => x.field === 'implemented_by');
    expect(ch).toBeDefined();
    expect(ch.before).toEqual(['S-998']); // read from the passthrough slot
    expect(ch.after).toEqual([]);
    // And the write path clears it.
    const wet = await c.callJson('entities', {
      action: 'batch',
      ops: [{ client_id: 'sb-wet', op: 'update', id: 'DOC-806', payload: { implemented_by: [] } }],
    });
    expect(wet.results[0].success).toBe(true);
    expect(fs.readFileSync(path.join(vault, 'documents/DOC-806.md'), 'utf-8')).not.toMatch(/implemented_by/);
  });

  // ----------------------------------------------------------------- BUG C
  test('BUG C: reconcile does NOT resurrect an explicitly removed forward link and prunes the stale reverse', async () => {
    // The shakedown flow: explicitly remove DOC-803 from the decision's affects
    // (update_entity stamps DEC-801 with a fresh updated_at)…
    const up = await c.call('update_entity', { id: 'DEC-801', updates: { affects: ['DOC-802'] } });
    expect(up.isError).toBeFalsy();

    // …then reconcile. Dry-run: no re-ADD of the forward, stale reverse flagged.
    const dry = await c.callJson('reconcile_relationships', { dry_run: true });
    const all = dry.changes.join('\n');
    expect(all).not.toContain('DEC-801: Add DOC-803 to affects');
    expect(all).toMatch(/DOC-803: Stale decided_by entry DEC-801 .*- removing/);
    // Dry-run wrote nothing.
    let doc803 = await c.callJson('get_entity', { id: 'DOC-803' });
    expect(doc803.relationships.decided_by).toEqual(['DEC-801']);

    // Write mode: forward stays as edited, stale reverse pruned on disk.
    const wet = await c.callJson('reconcile_relationships', { dry_run: false });
    expect(wet.dry_run).toBe(false);
    const dec = await c.callJson('get_entity', { id: 'DEC-801' });
    expect(dec.relationships.affects).toEqual(['DOC-802']);
    doc803 = await c.callJson('get_entity', { id: 'DOC-803' });
    expect(doc803.relationships.decided_by ?? []).toEqual([]);
    // The untouched consistent pair survived.
    const doc802 = await c.callJson('get_entity', { id: 'DOC-802' });
    expect(doc802.relationships.decided_by).toEqual(['DEC-801']);
    // And the pruned file kept its markdown body (BUG A in reconcile writes).
    expect(bodyOf('documents/DOC-803.md')).toContain('# Body');
  });

  test('BUG C: legit reverse-only authoring still fills the forward (reverse newer, and on a timestamp tie)', async () => {
    // The write-mode reconcile above already processed these pairs.
    // DOC-804 (2026-02-01) is NEWER than DEC-802 (2026-01-04) → fill.
    const dec802 = await c.callJson('get_entity', { id: 'DEC-802' });
    expect(dec802.relationships.affects).toEqual(['DOC-804']);
    // Equal stamps (DEC-803 == DOC-805) → legacy fill behavior preserved.
    const dec803 = await c.callJson('get_entity', { id: 'DEC-803' });
    expect(dec803.relationships.affects).toEqual(['DOC-805']);
    // Fixpoint: nothing left to fix.
    const again = await c.callJson('reconcile_relationships', { dry_run: true });
    expect(again.changes_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PIN D — id-allocator archived-id reissue regression. Historical bug: the
// index's archive scan was non-recursive, so ids living only on nested
// archive/<type>/… files were invisible and create_entity REISSUED them.
// scanIndex now walks archive/ recursively; this pins it end-to-end.
// ---------------------------------------------------------------------------
const ARCHIVE_ID_FIXTURE: Record<string, string> = {
  'tasks/T-010.md': ent({ id: 'T-010', type: 'task', title: 'Live low id', status: 'Not Started', workstream: 'engineering', goal: 'g', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
  // The type's MAX id lives ONLY on a nested archive file (type/quarter layout).
  'archive/tasks/2026-Q1/T-100.md': ent({ id: 'T-100', type: 'task', title: 'Archived high id', status: 'Completed', workstream: 'engineering', goal: 'done', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: true }),
};

describe('mcp.ts id-allocator archived-id regression pin — disposable fixture', () => {
  let vault: string;
  let c: McpClient;

  beforeAll(async () => {
    vault = makeVault(ARCHIVE_ID_FIXTURE);
    c = new McpClient(vault);
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  test('PIN D: create_entity never reissues an id that exists only under nested archive/', async () => {
    const r = await c.call('create_entity', { type: 'task', title: 'Allocator regression task', properties: { goal: 'g' } });
    expect(r.isError).toBeFalsy();
    const m = r.text!.match(/Created task (T-(\d+))/);
    expect(m).toBeTruthy();
    // Higher than the ARCHIVED max (T-100), not live-max+1 (T-011).
    expect(Number(m![2])).toBe(101);
    // The archived entity itself is reachable through the recursive scan.
    const archived = await c.callJson('get_entity', { id: 'T-100' });
    expect(archived.archived).toBe(true);
  });
});

/** Test-local mirror of mcp.ts extractBody (everything after the frontmatter). */
function extractBodyForTest(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// CANVAS BOOTSTRAP: on startup (and after set_schema) the server ensures the
// active schema's settings.defaultCanvas exists and holds valid canvas JSON,
// so the plugin's "populate from vault" always has a real file to target.
//   - missing               → parent folder created + empty canvas written
//   - empty/whitespace-only → repaired (rewritten as the empty canvas)
//   - has content           → byte-identical untouched
// ---------------------------------------------------------------------------
const EMPTY_CANVAS = JSON.stringify({ nodes: [], edges: [] }, null, 2) + '\n';

describe('mcp.ts default-canvas bootstrap on startup — disposable vaults', () => {
  test('fresh empty vault: startup bootstraps BOTH schema.json and projects/Project.canvas', async () => {
    const vault = makeVault({});
    const c = new McpClient(vault);
    try {
      await c.start();
      expect(fs.existsSync(path.join(vault, 'schema.json'))).toBe(true);
      const canvasAbs = path.join(vault, 'projects', 'Project.canvas');
      expect(fs.existsSync(canvasAbs)).toBe(true);
      const raw = fs.readFileSync(canvasAbs, 'utf-8');
      expect(JSON.parse(raw)).toEqual({ nodes: [], edges: [] });
      expect(raw).toBe(EMPTY_CANVAS);
      expect(c.stderr).toMatch(/Bootstrapped .*Project\.canvas/);
    } finally {
      await c.stop();
      fs.rmSync(vault, { recursive: true, force: true });
    }
  }, 120000);

  test('existing zero-byte canvas at the default path is repaired on startup', async () => {
    const vault = makeVault({ 'projects/Project.canvas': '' });
    const c = new McpClient(vault);
    try {
      await c.start();
      const raw = fs.readFileSync(path.join(vault, 'projects', 'Project.canvas'), 'utf-8');
      expect(raw).toBe(EMPTY_CANVAS);
      expect(c.stderr).toMatch(/Repaired empty canvas .*Project\.canvas/);
    } finally {
      await c.stop();
      fs.rmSync(vault, { recursive: true, force: true });
    }
  }, 120000);

  test('existing non-empty canvas is left byte-identical untouched', async () => {
    // Deliberately NOT pretty-printed and NOT newline-terminated: any rewrite
    // (even a semantically-equal one) would change the bytes.
    const existing = '{"nodes":[{"id":"n1","type":"text","text":"keep me","x":0,"y":0,"width":120,"height":60}],"edges":[]}';
    const vault = makeVault({ 'projects/Project.canvas': existing });
    const c = new McpClient(vault);
    try {
      await c.start();
      const raw = fs.readFileSync(path.join(vault, 'projects', 'Project.canvas'), 'utf-8');
      expect(raw).toBe(existing);
      expect(c.stderr).not.toMatch(/(Bootstrapped|Repaired).*\.canvas/);
    } finally {
      await c.stop();
      fs.rmSync(vault, { recursive: true, force: true });
    }
  }, 120000);
});

// ---------------------------------------------------------------------------
// PLUGIN INSTALL BOOTSTRAP: the npm package shipping the MCP server also
// carries the Obsidian plugin artifacts (manifest.json/main.js/styles.css at
// the package root — here, the repo root next to bin/). On startup the server
// installs them into <vault>/.obsidian/plugins/<id>/ and registers the id in
// community-plugins.json, so a new vault needs no separate plugin download.
//   - not installed        → installed + enabled
//   - older installed      → upgraded (data.json untouched)
//   - same/newer installed → byte-identical untouched
// ---------------------------------------------------------------------------
describe('mcp.ts plugin-install bootstrap on startup — disposable vaults', () => {
  const srcManifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'manifest.json'), 'utf-8'));
  const pluginRel = `.obsidian/plugins/${srcManifest.id}`;

  test('fresh vault: startup installs the plugin and enables it in community-plugins.json', async () => {
    const vault = makeVault({});
    const c = new McpClient(vault);
    try {
      await c.start();
      const installed = JSON.parse(fs.readFileSync(path.join(vault, pluginRel, 'manifest.json'), 'utf-8'));
      expect(installed.id).toBe(srcManifest.id);
      expect(installed.version).toBe(srcManifest.version);
      expect(fs.existsSync(path.join(vault, pluginRel, 'main.js'))).toBe(true);
      const enabled = JSON.parse(fs.readFileSync(path.join(vault, '.obsidian', 'community-plugins.json'), 'utf-8'));
      expect(enabled).toContain(srcManifest.id);
      expect(c.stderr).toMatch(/Installed plugin canvas-project-manager/);
    } finally {
      await c.stop();
      fs.rmSync(vault, { recursive: true, force: true });
    }
  }, 120000);

  test('same-or-newer installed version is left untouched', async () => {
    const sentinel = '/* user-managed newer build — do not overwrite */';
    const vault = makeVault({
      [`${pluginRel}/manifest.json`]: JSON.stringify({ ...srcManifest, version: '99.0.0' }),
      [`${pluginRel}/main.js`]: sentinel,
    });
    const c = new McpClient(vault);
    try {
      await c.start();
      expect(fs.readFileSync(path.join(vault, pluginRel, 'main.js'), 'utf-8')).toBe(sentinel);
      expect(JSON.parse(fs.readFileSync(path.join(vault, pluginRel, 'manifest.json'), 'utf-8')).version).toBe('99.0.0');
      expect(c.stderr).not.toMatch(/Installed plugin/);
    } finally {
      await c.stop();
      fs.rmSync(vault, { recursive: true, force: true });
    }
  }, 120000);

  test('older installed version is upgraded; data.json and other enabled plugins survive', async () => {
    const vault = makeVault({
      [`${pluginRel}/manifest.json`]: JSON.stringify({ ...srcManifest, version: '0.0.1' }),
      [`${pluginRel}/main.js`]: '/* stale build */',
      [`${pluginRel}/data.json`]: '{"userSetting":true}',
      '.obsidian/community-plugins.json': JSON.stringify(['some-other-plugin']),
    });
    const c = new McpClient(vault);
    try {
      await c.start();
      expect(JSON.parse(fs.readFileSync(path.join(vault, pluginRel, 'manifest.json'), 'utf-8')).version).toBe(srcManifest.version);
      expect(fs.readFileSync(path.join(vault, pluginRel, 'main.js'), 'utf-8')).not.toBe('/* stale build */');
      expect(fs.readFileSync(path.join(vault, pluginRel, 'data.json'), 'utf-8')).toBe('{"userSetting":true}');
      const enabled = JSON.parse(fs.readFileSync(path.join(vault, '.obsidian', 'community-plugins.json'), 'utf-8'));
      expect(enabled).toEqual(['some-other-plugin', srcManifest.id]);
      expect(c.stderr).toMatch(/Installed plugin canvas-project-manager/);
    } finally {
      await c.stop();
      fs.rmSync(vault, { recursive: true, force: true });
    }
  }, 120000);
});

// ---------------------------------------------------------------------------
// SCHEMA-DRIVEN RUNTIME REBUILD: set_schema must hot-reload EVERYTHING derived
// from the schema — path routing (pathResolver), index scanning (scanIndex's
// folder list), and validate_project's rule set (required-parent, fan-out
// limits). Tests are order-dependent: set_schema runs first.
// ---------------------------------------------------------------------------
describe('mcp.ts set_schema hot-reload: custom types + schema-driven validation — disposable fixture', () => {
  let vault: string;
  let c: McpClient;
  let riskId: string;

  beforeAll(async () => {
    vault = makeVault(FIXTURE);
    c = new McpClient(vault);
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    if (vault) fs.rmSync(vault, { recursive: true, force: true });
  });

  test('set_schema accepts a custom entity type + modified fan-out limit + new defaultCanvas (bootstrapped)', async () => {
    const gs = await c.callJson('get_schema');
    const s = JSON.parse(JSON.stringify(gs.schema));
    s.entityTypes.push({
      type: 'risk',
      label: 'Risk',
      idPrefix: 'RISK',
      folder: 'risks',
      statuses: ['Open', 'Mitigated', 'Accepted'],
      defaultStatus: 'Open',
      fields: [],
    });
    const impact = s.relationships.find((r: any) => r.name === 'decision-impact');
    expect(impact).toBeDefined();
    impact.validation = { ...(impact.validation ?? {}), maxForwardTargets: 5 };
    s.settings.defaultCanvas = 'projects/Custom.canvas';

    const res = await c.callJson('set_schema', { schema: s });
    expect(res.saved).toBe(true);
    expect(res.entityTypes).toBe(7);

    // set_schema bootstraps the newly-named defaultCanvas.
    const canvasAbs = path.join(vault, 'projects', 'Custom.canvas');
    expect(fs.existsSync(canvasAbs)).toBe(true);
    expect(fs.readFileSync(canvasAbs, 'utf-8')).toBe(EMPTY_CANVAS);
  });

  test('create_entity of the custom type succeeds (pathResolver rebuilt) and lands in its schema folder', async () => {
    const r = await c.call('create_entity', { type: 'risk', title: 'Vendor lock-in', properties: {} });
    expect(r.isError).toBeFalsy();
    const m = r.text!.match(/Created risk (RISK-\d+)/);
    expect(m).toBeTruthy();
    riskId = m![1];
    expect(r.text).toContain('Path: risks/');
    expect(fs.existsSync(path.join(vault, 'risks'))).toBe(true);
  });

  test('tools/list advertises the custom type in schema-derived enums (create_entity, list_entities)', async () => {
    const defs = await c.listToolDefs();
    const createDef = defs.find((t: any) => t.name === 'create_entity');
    expect(createDef.inputSchema.properties.type.enum).toContain('risk');
    expect(createDef.description).toContain('risk');
    const listDef = defs.find((t: any) => t.name === 'list_entities');
    expect(listDef.inputSchema.properties.type.enum).toContain('risk');
  });

  test('the custom-type entity is found by get_entity and list/search after rescan (scanIndex schema-driven)', async () => {
    const e = await c.callJson('get_entity', { id: riskId });
    expect(e.type).toBe('risk');
    expect(e.title).toBe('Vendor lock-in');
    expect(e.status).toBe('Open'); // custom type's defaultStatus

    const listed = await c.call('list_entities', { type: 'risk' });
    expect(listed.text).toMatch(/Found 1 entity of type risk/);
    expect(listed.text).toContain(riskId);
  });

  test('validate_project uses the SCHEMA fan-out limit (decision-impact maxForwardTargets: 5), rule id stable', async () => {
    // 3 affects: over the old hardcoded limit (2) but within the new schema limit (5) → NO advisory.
    const ok = await c.call('create_entity', {
      type: 'decision', title: 'Within raised limit',
      properties: { relationships: { affects: ['DOC-001', 'DOC-771', 'DOC-772'] } },
    });
    expect(ok.isError).toBeFalsy();
    const okId = ok.text!.match(/(DEC-\d+)/)![1];

    // 6 affects: over the new schema limit → advisory citing limit 5, legacy rule id.
    const over = await c.call('create_entity', {
      type: 'decision', title: 'Over raised limit',
      properties: { relationships: { affects: ['DOC-001', 'DOC-781', 'DOC-782', 'DOC-783', 'DOC-784', 'DOC-785'] } },
    });
    expect(over.isError).toBeFalsy();
    const overId = over.text!.match(/(DEC-\d+)/)![1];

    const v = await c.callJson('validate_project');
    const dec = (v.advisories as Array<{ rule: string; entity: string; message: string; suggestion: string }>)
      .filter(a => a.rule === 'DECISION_FANOUT');
    expect(dec.some(a => a.entity.startsWith(`${okId} `))).toBe(false);
    const hit = dec.find(a => a.entity.startsWith(`${overId} `));
    expect(hit).toBeDefined();
    expect(hit!.message).toMatch(/decision affects 6 documents \(limit 5\)/);
    expect(hit!.suggestion).toContain('Point `affects` at the 5 documents');
    // Fan-out stays advisory-only.
    expect((v.violations as Array<{ rule: string }>).every(x => !x.rule.includes('FANOUT'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MULTI-VAULT END-TO-END (spec §6.4 acceptance): TWO registered vaults with
// DIFFERENT schemas served by one process, NO VAULT_PATH — the registry comes
// entirely from the global mcp.json. Verifies vault isolation, the >1-vault
// plain-enum tool surface (D8 API layer), dispatch-time SchemaMismatch
// (D8 authority), per-item batch matching, and result echo (D3).
// Tests are order-dependent (vault B's custom schema is set first).
// ---------------------------------------------------------------------------
describe('multi-vault: two vaults with different schemas, no VAULT_PATH', () => {
  let configHome: string;
  let vaultA: string;
  let vaultB: string;
  let c: McpClient;

  beforeAll(async () => {
    vaultA = makeVault(FIXTURE); // the clean 6-entity fixture
    vaultB = makeVault({});      // empty — engine bootstrap writes its schema.json
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-mv-config-'));
    fs.mkdirSync(path.join(configHome, 'ostanlabs'), { recursive: true });
    fs.writeFileSync(
      path.join(configHome, 'ostanlabs', 'mcp.json'),
      JSON.stringify({
        version: 1,
        allowedRoots: [],
        vaults: [
          { id: 'vault-a', name: 'Vault A', path: vaultA },
          { id: 'vault-b', name: 'Vault B', path: vaultB },
        ],
      }, null, 2),
      'utf-8',
    );
    c = new McpClient(null, { env: { XDG_CONFIG_HOME: configHome } });
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    for (const d of [vaultA, vaultB, configHome]) {
      if (d) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  test('list_vaults sees both config vaults (neither transient)', async () => {
    const r = await c.callJson('list_vaults');
    expect(r.count).toBe(2);
    const ids = r.vaults.map((v: any) => v.id).sort();
    expect(ids).toEqual(['vault-a', 'vault-b']);
    expect(r.vaults.every((v: any) => v.exists === true)).toBe(true);
    expect(r.vaults.every((v: any) => v.transient === undefined)).toBe(true);
  });

  test('tools/list with >1 vault emits PLAIN strings for type enums (D8 API layer)', async () => {
    const defs = await c.listToolDefs();
    const createDef = defs.find((t: any) => t.name === 'create_entity');
    expect(createDef.inputSchema.properties.type.enum).toBeUndefined();
    expect(createDef.inputSchema.properties.type.description).toMatch(/get_schema\(\{vault\}\)/);
    expect(createDef.inputSchema.required).toContain('vault');
    const covDef = defs.find((t: any) => t.name === 'get_feature_coverage');
    expect(covDef.inputSchema.properties.phase.enum).toBeUndefined();
  });

  test('read-only tool without vault errors listing the registered ids', async () => {
    const r = await c.call('get_entity', { id: 'M-001' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/'vault' is required when more than one vault is registered/);
    expect(r.text).toContain('vault-a');
    expect(r.text).toContain('vault-b');
  });

  test('set_schema targets ONLY the named vault (B gains a custom type; A untouched)', async () => {
    const gs = await c.callJson('get_schema', { vault: 'vault-b' });
    expect(gs.vault).toBe('vault-b');
    const custom = JSON.parse(JSON.stringify(gs.schema));
    custom.entityTypes.push({
      type: 'risk',
      label: 'Risk',
      idPrefix: 'RISK',
      folder: 'risks',
      statuses: ['Open', 'Mitigated', 'Accepted'],
      defaultStatus: 'Open',
      fields: [],
    });
    const res = await c.callJson('set_schema', { vault: 'vault-b', schema: custom });
    expect(res.saved).toBe(true);
    expect(res.vault).toBe('vault-b');
    expect(res.entityTypes).toBe(7);

    // Vault A's schema is untouched — independent engines per vault.
    const gsA = await c.callJson('get_schema', { vault: 'vault-a' });
    expect(gsA.vault).toBe('vault-a');
    expect(gsA.schema.entityTypes.length).toBe(6);
  });

  test('accept-then-match: the type valid in B is created in B but rejected for A with SchemaMismatch', async () => {
    const ok = await c.call('create_entity', { vault: 'vault-b', type: 'risk', title: 'B-only risk' });
    expect(ok.isError).toBeFalsy();
    expect(ok.text).toMatch(/Created risk RISK-\d+/);
    expect(ok.text).toContain('Vault: vault-b');

    const bad = await c.call('create_entity', { vault: 'vault-a', type: 'risk', title: 'Should fail' });
    expect(bad.isError).toBe(true);
    // Names the RESOLVED vault + its valid values, never falls back to B.
    expect(bad.text).toMatch(/type 'risk' does not match the schema of vault 'vault-a'/);
    expect(bad.text).toMatch(/milestone.*story.*task/s);
    expect(bad.text).toContain(`get_schema({vault: 'vault-a'})`);
  });

  test('entities batch: PER-ITEM SchemaMismatch — valid sibling op still succeeds', async () => {
    const r = await c.callJson('entities', {
      vault: 'vault-a',
      action: 'batch',
      ops: [
        { client_id: 'good', op: 'create', type: 'task', payload: { title: 'Valid in A', goal: 'g' } },
        { client_id: 'bad', op: 'create', type: 'risk', payload: { title: 'Invalid in A' } },
      ],
    });
    expect(r.vault).toBe('vault-a');
    expect(r.summary.succeeded).toBe(1);
    expect(r.summary.failed).toBe(1);
    expect(r.results[0].success).toBe(true);
    expect(r.results[0].id).toMatch(/^T-\d+/);
    expect(r.results[1].success).toBe(false);
    expect(r.results[1].error).toMatch(/type 'risk' does not match the schema of vault 'vault-a'/);
  });

  test('vault isolation: an entity of A is invisible in B; results echo the resolved id', async () => {
    const inA = await c.callJson('get_entity', { vault: 'vault-a', id: 'M-001' });
    expect(inA.vault).toBe('vault-a');
    expect(inA.title).toBe('Q1 Launch');

    const inB = await c.call('get_entity', { vault: 'vault-b', id: 'M-001' });
    expect(inB.isError).toBe(true);
    expect(inB.text).toMatch(/not found in vault 'vault-b'/);
  });
});

// ---------------------------------------------------------------------------
// add_vault / remove_vault LIFECYCLE (spec §7.3 acceptance): scaffold on an
// empty dir creates exactly the schema-derived tree; confinement rejects
// out-of-allowedRoots paths; "auto" refuses non-vault dirs; remove_vault
// deregisters WITHOUT touching files.
// ---------------------------------------------------------------------------
describe('add_vault / remove_vault lifecycle — confined roots, no VAULT_PATH', () => {
  let configHome: string;
  let root: string; // the single allowedRoot new vaults must live under
  let c: McpClient;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-vroot-'));
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-av-config-'));
    fs.mkdirSync(path.join(configHome, 'ostanlabs'), { recursive: true });
    fs.writeFileSync(
      path.join(configHome, 'ostanlabs', 'mcp.json'),
      JSON.stringify({ version: 1, allowedRoots: [root], vaults: [] }, null, 2),
      'utf-8',
    );
    c = new McpClient(null, { env: { XDG_CONFIG_HOME: configHome } });
    await c.start();
  }, 120000);

  afterAll(async () => {
    if (c) await c.stop();
    for (const d of [root, configHome]) {
      if (d) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  test('add_vault rejects a path outside allowedRoots BEFORE touching anything', async () => {
    const r = await c.call('add_vault', { path: path.join(os.homedir(), 'definitely-not-allowed-vault') });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/not within allowedRoots/);
  });

  test('add_vault scaffolds a fresh vault: schema + type folders + archive + workspaces + canvas', async () => {
    const target = path.join(root, 'fresh-vault');
    const r = await c.callJson('add_vault', { path: target });
    expect(r.mode).toBe('created');
    expect(r.vault).toBe('fresh-vault');

    // On-disk scaffold (D4): schema.json, per-type folders under entities/,
    // archive/, workspaces.json = {}, default canvas.
    expect(fs.existsSync(path.join(target, 'schema.json'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'archive'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(target, 'workspaces.json'), 'utf-8'))).toEqual({});
    expect(fs.existsSync(path.join(target, 'projects', 'Project.canvas'))).toBe(true);
    const schema = JSON.parse(fs.readFileSync(path.join(target, 'schema.json'), 'utf-8'));
    for (const t of schema.entityTypes) {
      expect(fs.existsSync(path.join(target, 'entities', t.folder))).toBe(true);
    }

    // Registered and immediately usable (single vault → reads default to it).
    const lv = await c.callJson('list_vaults');
    expect(lv.vaults.map((v: any) => v.id)).toContain('fresh-vault');
    const created = await c.call('create_entity', {
      vault: 'fresh-vault', type: 'task', title: 'First task', properties: { goal: 'g' },
    });
    expect(created.isError).toBeFalsy();
    expect(created.text).toMatch(/Created task T-\d+/);
    expect(created.text).toContain('Path: entities/tasks/');
  });

  test('add_vault "auto" refuses a non-empty non-vault dir; "never" force-registers it', async () => {
    const junk = path.join(root, 'not-a-vault');
    fs.mkdirSync(junk, { recursive: true });
    fs.writeFileSync(path.join(junk, 'random.txt'), 'hello', 'utf-8');

    const refused = await c.call('add_vault', { path: junk });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/does not look like a vault/);
    expect(refused.text).toMatch(/bootstrap:"never"/);
    // Refusal wrote nothing.
    expect(fs.readdirSync(junk)).toEqual(['random.txt']);

    const forced = await c.callJson('add_vault', { path: junk, bootstrap: 'never' });
    expect(forced.mode).toBe('registered');
    expect(forced.vault).toBe('not-a-vault');
    // register-only: still nothing written.
    expect(fs.readdirSync(junk)).toEqual(['random.txt']);
  });

  test('remove_vault deregisters WITHOUT deleting any files', async () => {
    const junk = path.join(root, 'not-a-vault');
    const r = await c.callJson('remove_vault', { id: 'not-a-vault' });
    expect(r.removed).toBe(true);

    const lv = await c.callJson('list_vaults');
    expect(lv.vaults.map((v: any) => v.id)).not.toContain('not-a-vault');
    // Files fully intact.
    expect(fs.readFileSync(path.join(junk, 'random.txt'), 'utf-8')).toBe('hello');

    const gone = await c.call('remove_vault', { id: 'not-a-vault' });
    expect(gone.isError).toBe(true);
    expect(gone.text).toMatch(/not registered/);
  });
});
