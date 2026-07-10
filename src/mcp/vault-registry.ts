/**
 * src/mcp/vault-registry.ts — VaultRegistry (spec §6.1 / D2, work item W5).
 *
 * The multi-vault source of truth: loads the global mcp.json PER CALL
 * (mtime-gated), MERGES the read sources (file.vaults ∪ VAULT_PATH ∪ MCP
 * client roots — never replaces), resolves vault refs, lazily builds and
 * caches per-vault engines, and mutates the config under an advisory
 * lockfile with .bak + atomic write-rename.
 *
 * Fail-loud invariants (D2 / §10):
 * - a corrupt config THROWS ConfigCorrupt — never silently returns an empty
 *   registry (that leads agents to re-bootstrap over real data);
 * - a registered path missing on disk THROWS VaultPathMissing — never
 *   auto-created;
 * - transient (absorbed) entries are NEVER persisted by mutateConfig.
 *
 * Fully dependency-injected: configPath, buildEngine, env, rootsProvider all
 * arrive via the constructor so tests run against temp dirs and stubs, and
 * wire-up (mcp.ts, W8) injects resolveConfigPath() + buildVaultEngine.
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import {
  ConfigCorrupt,
  VaultNotFound,
  VaultPathMissing,
} from './types.js';
import type { McpConfig, VaultEntry, VaultEngine, ArchiveLayout } from './types.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** A lock older than this is presumed abandoned (holder crashed) and taken over. */
const STALE_LOCK_MS = 5_000;
/** Base delay between lock acquisition attempts (plus jitter). */
const LOCK_RETRY_MS = 25;
/** Give up acquiring the lock after this long — something is badly wedged. */
const LOCK_ACQUIRE_TIMEOUT_MS = 15_000;

/** Layout defaults for absorbed (VAULT_PATH / client-root) vaults — matches
 * the hardcoded layout of the single-vault mcp.ts (spec §6.1). */
const TRANSIENT_LAYOUT = {
  entitiesFolder: '',
  archiveFolder: 'archive',
  archiveLayout: 'by-type' as ArchiveLayout,
  canvasFolder: 'projects',
};

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errCode(e: unknown): string | undefined {
  return (e as NodeJS.ErrnoException)?.code;
}

/** Kebab slug of a vault folder basename: 'My Cool Vault' → 'my-cool-vault'. */
export function kebabSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'vault';
}

/**
 * Validate + normalize a parsed config. Returns the error description when the
 * shape is unusable (caller decides whether that is ConfigCorrupt or a rejected
 * mutation); on success fills missing per-vault layout fields with defaults.
 */
function normalizeConfigShape(raw: unknown): { config?: McpConfig; error?: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'config root is not an object' };
  }
  const c = raw as Record<string, unknown>;
  if (c.version !== 1) {
    return { error: `unsupported version ${JSON.stringify(c.version)} (expected 1)` };
  }
  if (!Array.isArray(c.allowedRoots) || c.allowedRoots.some((r) => typeof r !== 'string')) {
    return { error: 'allowedRoots must be an array of strings' };
  }
  if (!Array.isArray(c.vaults)) {
    return { error: 'vaults must be an array' };
  }
  const vaults: VaultEntry[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < c.vaults.length; i++) {
    const v = c.vaults[i] as Record<string, unknown> | null;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      return { error: `vaults[${i}] is not an object` };
    }
    if (typeof v.id !== 'string' || v.id.length === 0) {
      return { error: `vaults[${i}].id must be a non-empty string` };
    }
    if (seenIds.has(v.id)) {
      return { error: `duplicate vault id '${v.id}'` };
    }
    seenIds.add(v.id);
    if (typeof v.path !== 'string' || v.path.length === 0) {
      return { error: `vaults[${i}] ('${v.id}').path must be a non-empty string` };
    }
    const name = v.name === undefined ? v.id : v.name;
    if (typeof name !== 'string') {
      return { error: `vaults[${i}] ('${v.id}').name must be a string` };
    }
    const layout: Record<string, unknown> = {};
    for (const key of ['entitiesFolder', 'archiveFolder', 'canvasFolder'] as const) {
      const value = v[key] === undefined ? TRANSIENT_LAYOUT[key] : v[key];
      if (typeof value !== 'string') {
        return { error: `vaults[${i}] ('${v.id}').${key} must be a string` };
      }
      layout[key] = value;
    }
    const archiveLayout = v.archiveLayout === undefined ? 'by-type' : v.archiveLayout;
    if (archiveLayout !== 'by-type' && archiveLayout !== 'quarterly') {
      return { error: `vaults[${i}] ('${v.id}').archiveLayout must be 'by-type' or 'quarterly'` };
    }
    const entry: VaultEntry = {
      id: v.id,
      name,
      path: v.path,
      entitiesFolder: layout.entitiesFolder as string,
      archiveFolder: layout.archiveFolder as string,
      archiveLayout,
      canvasFolder: layout.canvasFolder as string,
    };
    if (v.transient === true) entry.transient = true;
    vaults.push(entry);
  }
  return {
    config: { version: 1, allowedRoots: c.allowedRoots as string[], vaults },
  };
}

function emptyConfig(): McpConfig {
  return { version: 1, allowedRoots: [], vaults: [] };
}

function cloneConfig(c: McpConfig): McpConfig {
  return {
    version: 1,
    allowedRoots: [...c.allowedRoots],
    vaults: c.vaults.map((v) => ({ ...v })),
  };
}

// -----------------------------------------------------------------------------
// VaultRegistry
// -----------------------------------------------------------------------------

export interface VaultRegistryDeps {
  /** Absolute path of the global mcp.json (resolveConfigPath() at wire-up). */
  configPath: string;
  /** Engine factory (vault-engine.ts at wire-up; a stub in tests). */
  buildEngine: (entry: VaultEntry) => Promise<VaultEngine>;
  /** Absorb source: legacy single-vault env var. */
  env?: { VAULT_PATH?: string };
  /** Absorb source: MCP client roots (SDK ^1.29 roots/list; wired later). */
  rootsProvider?: () => Promise<string[]>;
}

export class VaultRegistry {
  private readonly deps: VaultRegistryDeps;
  /** Lazily built engines, cached by vault id (as build promises so
   * concurrent engine() calls share a single buildEngine invocation). */
  private engines = new Map<string, Promise<VaultEngine>>();
  /** mtime-gate cache of the parsed FILE config (pre-merge). */
  private fileCache: { mtimeMs: number; size: number; config: McpConfig } | null = null;

  constructor(deps: VaultRegistryDeps) {
    this.deps = deps;
  }

  // ---------------------------------------------------------------------------
  // loadConfig — per-call re-read, mtime-gated, merge (never replace)
  // ---------------------------------------------------------------------------

  /**
   * Re-read per call: stat the config file; unchanged mtime+size serves the
   * cached parse. Missing file → valid empty start. Corrupt file → THROW
   * ConfigCorrupt. The returned config is file.vaults merged with absorbed
   * VAULT_PATH / client-root entries (transient, never persisted) and is a
   * fresh copy each call — callers cannot poison the cache.
   */
  async loadConfig(): Promise<McpConfig> {
    const file = await this.readFileConfig();
    const merged = cloneConfig(file);

    const envPath = this.deps.env?.VAULT_PATH;
    if (envPath) this.absorb(merged, envPath);

    if (this.deps.rootsProvider) {
      let roots: string[] = [];
      try {
        roots = await this.deps.rootsProvider();
      } catch {
        // Client without roots support — skip silently (spec §6.1).
        roots = [];
      }
      for (const root of roots) this.absorb(merged, root);
    }
    return merged;
  }

  /** Parsed FILE config only (no absorb), mtime-gated. */
  private async readFileConfig(): Promise<McpConfig> {
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(this.deps.configPath);
    } catch (e) {
      if (errCode(e) === 'ENOENT') {
        // Valid empty start — loadConfig never creates the file.
        this.fileCache = null;
        return emptyConfig();
      }
      throw e;
    }
    if (
      this.fileCache &&
      this.fileCache.mtimeMs === stat.mtimeMs &&
      this.fileCache.size === stat.size
    ) {
      return this.fileCache.config;
    }
    const config = await this.parseConfigFile();
    this.fileCache = { mtimeMs: stat.mtimeMs, size: stat.size, config };
    return config;
  }

  /** Read + parse + shape-validate the file; missing → empty; bad → ConfigCorrupt. */
  private async parseConfigFile(): Promise<McpConfig> {
    let raw: string;
    try {
      raw = await fsp.readFile(this.deps.configPath, 'utf8');
    } catch (e) {
      if (errCode(e) === 'ENOENT') return emptyConfig();
      throw e;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new ConfigCorrupt(this.deps.configPath, `invalid JSON: ${(e as Error).message}`);
    }
    const { config, error } = normalizeConfigShape(parsed);
    if (!config) {
      throw new ConfigCorrupt(this.deps.configPath, error!);
    }
    return config;
  }

  /**
   * Merge one absorbed path into the config (spec §6.1 collision policy):
   * - same path already present (any source) → no-op;
   * - slug taken by a DIFFERENT path → suffix -2, -3, …
   */
  private absorb(config: McpConfig, rawPath: string): void {
    const abs = path.resolve(rawPath);
    if (config.vaults.some((v) => path.resolve(v.path) === abs)) return;
    const base = kebabSlug(path.basename(abs));
    let id = base;
    for (let n = 2; config.vaults.some((v) => v.id === id); n++) {
      id = `${base}-${n}`;
    }
    config.vaults.push({
      id,
      name: path.basename(abs),
      path: abs,
      ...TRANSIENT_LAYOUT,
      transient: true,
    });
  }

  // ---------------------------------------------------------------------------
  // list / resolve
  // ---------------------------------------------------------------------------

  async list(): Promise<VaultEntry[]> {
    return (await this.loadConfig()).vaults;
  }

  /** Match by id, then by name; otherwise throw VaultNotFound. */
  async resolve(ref: string): Promise<VaultEntry> {
    const vaults = await this.list();
    const found =
      vaults.find((v) => v.id === ref) ?? vaults.find((v) => v.name === ref);
    if (!found) {
      throw new VaultNotFound(ref, vaults.map((v) => v.id));
    }
    return found;
  }

  // ---------------------------------------------------------------------------
  // engine — lazy build + cache; fail-loud on missing path
  // ---------------------------------------------------------------------------

  async engine(ref: string): Promise<VaultEngine> {
    const entry = await this.resolve(ref);
    // Fail-loud EVERY call (not only on first build): a vault dir can vanish
    // after registration. NEVER auto-created.
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(entry.path);
    } catch {
      throw new VaultPathMissing(entry.id, entry.path);
    }
    if (!stat.isDirectory()) {
      throw new VaultPathMissing(entry.id, entry.path);
    }
    let pending = this.engines.get(entry.id);
    if (!pending) {
      pending = this.deps.buildEngine(entry);
      this.engines.set(entry.id, pending);
      // A failed build must not poison the cache forever.
      pending.catch(() => {
        if (this.engines.get(entry.id) === pending) this.engines.delete(entry.id);
      });
    }
    return pending;
  }

  /** Drop the cached engine (after schema/layout change) — next engine() rebuilds. */
  invalidate(id: string): void {
    this.engines.delete(id);
  }

  // ---------------------------------------------------------------------------
  // mutateConfig — advisory lockfile, re-read under lock, .bak, atomic rename
  // ---------------------------------------------------------------------------

  /**
   * Mutate the PERSISTED config under an advisory lock:
   * 1. mkdir -p the config dir (first write only — reads never create it);
   * 2. acquire `<configPath>.lock` via exclusive create (wx), pid inside;
   *    stale locks (> ~5s old) are taken over; otherwise retry with backoff;
   * 3. UNDER the lock: re-read fresh from disk (never the mtime cache, never
   *    merged transients), apply fn, validate the result shape (invalid →
   *    throw, disk untouched), strip transient entries, write `.bak` of the
   *    previous content, then atomic write (tmp file + rename);
   * 4. release the lock (finally).
   */
  async mutateConfig(fn: (c: McpConfig) => void): Promise<void> {
    await fsp.mkdir(path.dirname(this.deps.configPath), { recursive: true });
    const lockPath = `${this.deps.configPath}.lock`;
    await this.acquireLock(lockPath);
    try {
      // Fresh read under the lock — another process may have written since
      // our last loadConfig. This is the CAS: fn always sees latest disk state.
      let previousRaw: string | null = null;
      try {
        previousRaw = await fsp.readFile(this.deps.configPath, 'utf8');
      } catch (e) {
        if (errCode(e) !== 'ENOENT') throw e;
      }
      const config = await this.parseConfigFile();

      fn(config);

      const { config: validated, error } = normalizeConfigShape(config);
      if (!validated) {
        throw new Error(
          `mutateConfig produced an invalid config (nothing written): ${error}`
        );
      }
      // Absorbed entries are runtime-only — NEVER persisted.
      const persisted: McpConfig = {
        ...validated,
        vaults: validated.vaults
          .filter((v) => !v.transient)
          .map(({ transient, ...rest }) => rest),
      };

      if (previousRaw !== null) {
        await fsp.writeFile(`${this.deps.configPath}.bak`, previousRaw, 'utf8');
      }
      const tmpPath = `${this.deps.configPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      await fsp.writeFile(tmpPath, JSON.stringify(persisted, null, 2) + '\n', 'utf8');
      await fsp.rename(tmpPath, this.deps.configPath);
      // Force a fresh parse on the next loadConfig.
      this.fileCache = null;
    } finally {
      await fsp.unlink(lockPath).catch(() => {});
    }
  }

  /**
   * Advisory lock: exclusive-create (`wx`) of `<configPath>.lock` containing
   * our pid. EEXIST → someone holds it: if the lockfile's mtime is older than
   * STALE_LOCK_MS the holder is presumed dead and the lock is removed
   * (takeover), else retry with backoff + jitter until LOCK_ACQUIRE_TIMEOUT_MS.
   */
  private async acquireLock(lockPath: string): Promise<void> {
    const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
    for (;;) {
      try {
        await fsp.writeFile(lockPath, String(process.pid), { flag: 'wx' });
        return;
      } catch (e) {
        if (errCode(e) !== 'EEXIST') throw e;
      }
      try {
        const st = await fsp.stat(lockPath);
        if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
          // Holder presumed dead — take the lock over and re-race for it.
          await fsp.unlink(lockPath).catch(() => {});
          continue;
        }
      } catch {
        // Lock vanished between EEXIST and stat — re-race immediately.
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out acquiring config lock at ${lockPath} after ${LOCK_ACQUIRE_TIMEOUT_MS}ms. ` +
            `If no other MCP process is running, delete the lockfile.`
        );
      }
      await sleep(LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS));
    }
  }
}
