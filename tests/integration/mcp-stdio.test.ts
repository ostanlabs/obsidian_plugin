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

class McpClient {
  private srv!: ChildProcessWithoutNullStreams;
  private pending = new Map<number, (m: any) => void>();
  private nextId = 1;
  public stderr = '';
  private exited: { code: number | null; signal: string | null } | null = null;

  constructor(private vault: string) {}

  async start(): Promise<void> {
    this.srv = spawn('node', [SERVER_BIN], {
      // Inherit env so NODE_V8_COVERAGE (coverage harness) propagates to the child.
      env: { ...process.env, VAULT_PATH: this.vault },
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

  async call(name: string, args: Record<string, unknown> = {}): Promise<CallResult> {
    const r = await this.rpc('tools/call', { name, arguments: args });
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
    ]) {
      expect(tools).toContain(t);
    }
    expect(tools.length).toBeGreaterThanOrEqual(20);
  });

  describe('schema tools', () => {
    test('get_schema bootstraps schema.json and reports the default source', async () => {
      const gs = await client.callJson('get_schema');
      expect(gs.errors).toEqual([]);
      // On first boot the schema was bootstrapped from the codified default.
      expect(gs.source).toBe('default');
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

      // The file exists on disk in the fixture vault.
      const files = fs.readdirSync(path.join(vault, 'tasks'));
      expect(files.some((f) => f.startsWith(newId))).toBe(true);

      // And is now retrievable through the index.
      const fetched = await client.callJson('get_entity', { id: newId });
      expect(fetched.id).toBe(newId);
      expect(fetched.fields.goal).toBe('Cover the MCP tools');
    });

    test('create_entity with invalid status is rejected (validation isError)', async () => {
      const res = await client.call('create_entity', {
        type: 'decision',
        title: 'Bad status decision',
        properties: { status: 'Totally Invalid Status' },
      });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/Validation failed|Invalid status/i);
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
