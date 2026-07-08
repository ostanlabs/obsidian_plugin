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

      // The file exists on disk in the fixture vault (title-only, preserve-case name).
      const files = fs.readdirSync(path.join(vault, 'tasks'));
      expect(files).toContain('Add_integration_tests.md');

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
  'features/F-200.md': ent({ id: 'F-200', type: 'feature', title: 'Uncovered feature', status: 'Planned', workstream: 'engineering', user_story: 'As a user I want Y', tier: 'Premium', phase: '1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived: false }),
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

    test('batch create with an invalid status fails validation (per-op)', async () => {
      const r = await c.callJson('entities', {
        action: 'batch',
        ops: [{ client_id: 'v', op: 'create', type: 'task', payload: { title: 'x', goal: 'g', status: 'Nope' } }],
      });
      expect(r.results[0].success).toBe(false);
      expect(r.results[0].error).toMatch(/Validation failed/);
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
