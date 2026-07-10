/**
 * MCP suite — VaultRegistry (spec §6.1 / D2, work item W5).
 *
 * Real-file semantics on purpose: config load/merge/mtime-gating, the
 * advisory lockfile under concurrent mutateConfig, .bak preservation, and
 * atomic writes are all about what actually happens on disk, so this suite
 * uses real temp dirs (os.tmpdir + mkdtemp) instead of the in-memory harness.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { VaultRegistry } from '../../src/mcp/vault-registry.js';
import {
  ConfigCorrupt,
  VaultNotFound,
  VaultPathMissing,
} from '../../src/mcp/types.js';
import type { McpConfig, VaultEntry, VaultEngine } from '../../src/mcp/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDirs: string[] = [];

async function mkTmpDir(prefix = 'vault-registry-test-'): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function entry(id: string, vaultPath: string, name = id): VaultEntry {
  return {
    id,
    name,
    path: vaultPath,
    entitiesFolder: '',
    archiveFolder: 'archive',
    archiveLayout: 'by-type',
    canvasFolder: 'projects',
  };
}

async function writeConfig(configPath: string, config: McpConfig): Promise<void> {
  await fsp.mkdir(path.dirname(configPath), { recursive: true });
  await fsp.writeFile(configPath, JSON.stringify(config, null, 2));
}

function stubEngineBuilder() {
  return vi.fn(async (e: VaultEntry): Promise<VaultEngine> => {
    return { entry: e } as unknown as VaultEngine;
  });
}

function makeRegistry(opts: {
  configPath: string;
  env?: { VAULT_PATH?: string };
  rootsProvider?: () => Promise<string[]>;
  buildEngine?: (e: VaultEntry) => Promise<VaultEngine>;
}) {
  const buildEngine = opts.buildEngine ?? stubEngineBuilder();
  const registry = new VaultRegistry({
    configPath: opts.configPath,
    buildEngine,
    env: opts.env,
    rootsProvider: opts.rootsProvider,
  });
  return { registry, buildEngine };
}

let baseDir: string;
let configPath: string;

beforeEach(async () => {
  baseDir = await mkTmpDir();
  configPath = path.join(baseDir, 'ostanlabs', 'mcp.json');
});

afterEach(async () => {
  await Promise.all(
    tmpDirs.map((d) => fsp.rm(d, { recursive: true, force: true }))
  );
  tmpDirs = [];
});

// ---------------------------------------------------------------------------
// loadConfig — missing / corrupt / shape
// ---------------------------------------------------------------------------

describe('VaultRegistry.loadConfig', () => {
  it('missing config file yields a valid empty registry (not an error)', async () => {
    const { registry } = makeRegistry({ configPath });
    const config = await registry.loadConfig();
    expect(config).toEqual({ version: 1, allowedRoots: [], vaults: [] });
    expect(await registry.list()).toEqual([]);
    // loadConfig never creates the config dir/file.
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('corrupt JSON throws ConfigCorrupt — never masked to an empty registry', async () => {
    await fsp.mkdir(path.dirname(configPath), { recursive: true });
    await fsp.writeFile(configPath, '{ this is not json !!!');
    const { registry } = makeRegistry({ configPath });
    await expect(registry.loadConfig()).rejects.toThrow(ConfigCorrupt);
    // And again on the next call — no silent recovery to empty.
    await expect(registry.list()).rejects.toThrow(ConfigCorrupt);
  });

  it('valid JSON with a broken shape throws ConfigCorrupt', async () => {
    await fsp.mkdir(path.dirname(configPath), { recursive: true });
    await fsp.writeFile(
      configPath,
      JSON.stringify({ version: 1, allowedRoots: 'nope', vaults: {} })
    );
    const { registry } = makeRegistry({ configPath });
    await expect(registry.loadConfig()).rejects.toThrow(ConfigCorrupt);
  });

  it('re-reads per call: external writes are visible on the next loadConfig (mtime gate)', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', vaultA)],
    });
    const { registry } = makeRegistry({ configPath });
    expect((await registry.loadConfig()).vaults.map((v) => v.id)).toEqual(['alpha']);

    // Simulate another client editing the file between calls.
    const vaultB = await mkTmpDir('vault-b-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', vaultA), entry('beta', vaultB)],
    });
    // Make the mtime change unambiguous regardless of fs timestamp granularity.
    const future = new Date(Date.now() + 5000);
    await fsp.utimes(configPath, future, future);

    expect((await registry.loadConfig()).vaults.map((v) => v.id)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('unchanged mtime serves the cached parse (mutating the returned object does not poison it)', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', vaultA)],
    });
    const { registry } = makeRegistry({ configPath });
    const first = await registry.loadConfig();
    first.vaults.push(entry('injected', '/nowhere'));
    first.vaults[0].id = 'mangled';
    const second = await registry.loadConfig();
    expect(second.vaults.map((v) => v.id)).toEqual(['alpha']);
  });
});

// ---------------------------------------------------------------------------
// Absorb — VAULT_PATH and MCP roots merge (never replace)
// ---------------------------------------------------------------------------

describe('VaultRegistry absorb (VAULT_PATH / roots)', () => {
  it('absorbs VAULT_PATH as a transient entry with a kebab-slug id and default layout', async () => {
    const vaultDir = path.join(await mkTmpDir(), 'My Cool Vault');
    await fsp.mkdir(vaultDir);
    const { registry } = makeRegistry({
      configPath,
      env: { VAULT_PATH: vaultDir },
    });
    const config = await registry.loadConfig();
    expect(config.vaults).toHaveLength(1);
    expect(config.vaults[0]).toMatchObject({
      id: 'my-cool-vault',
      name: 'My Cool Vault',
      path: vaultDir,
      entitiesFolder: '',
      archiveFolder: 'archive',
      archiveLayout: 'by-type',
      canvasFolder: 'projects',
      transient: true,
    });
  });

  it('merges with file vaults instead of replacing them', async () => {
    const fileVault = await mkTmpDir('file-vault-');
    const envVault = path.join(await mkTmpDir(), 'EnvVault');
    await fsp.mkdir(envVault);
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('registered', fileVault)],
    });
    const { registry } = makeRegistry({ configPath, env: { VAULT_PATH: envVault } });
    const ids = (await registry.loadConfig()).vaults.map((v) => v.id);
    expect(ids).toEqual(['registered', 'envvault']);
  });

  it('slug collision with a DIFFERENT path gets a -2 suffix (then -3, ...)', async () => {
    const registered = await mkTmpDir('registered-');
    const other = path.join(await mkTmpDir(), 'Alpha');
    await fsp.mkdir(other);
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', registered), entry('alpha-2', registered, 'alpha two')],
    });
    const { registry } = makeRegistry({ configPath, env: { VAULT_PATH: other } });
    const config = await registry.loadConfig();
    const absorbed = config.vaults.find((v) => v.transient);
    expect(absorbed?.id).toBe('alpha-3');
  });

  it('same path already registered is a no-op (no duplicate, no transient)', async () => {
    const vaultDir = await mkTmpDir('shared-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('already-here', vaultDir)],
    });
    const { registry } = makeRegistry({ configPath, env: { VAULT_PATH: vaultDir } });
    const config = await registry.loadConfig();
    expect(config.vaults).toHaveLength(1);
    expect(config.vaults[0].id).toBe('already-here');
    expect(config.vaults[0].transient).toBeUndefined();
  });

  it('absorbs each MCP client root from rootsProvider as a transient vault', async () => {
    const rootA = path.join(await mkTmpDir(), 'Root A');
    const rootB = path.join(await mkTmpDir(), 'Root B');
    await fsp.mkdir(rootA);
    await fsp.mkdir(rootB);
    const { registry } = makeRegistry({
      configPath,
      rootsProvider: async () => [rootA, rootB],
    });
    const config = await registry.loadConfig();
    expect(config.vaults.map((v) => v.id)).toEqual(['root-a', 'root-b']);
    expect(config.vaults.every((v) => v.transient === true)).toBe(true);
  });

  it('a failing rootsProvider is skipped silently (env/file sources still merge)', async () => {
    const fileVault = await mkTmpDir('file-vault-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('registered', fileVault)],
    });
    const { registry } = makeRegistry({
      configPath,
      rootsProvider: async () => {
        throw new Error('client does not support roots');
      },
    });
    expect((await registry.loadConfig()).vaults.map((v) => v.id)).toEqual([
      'registered',
    ]);
  });
});

// ---------------------------------------------------------------------------
// resolve / list
// ---------------------------------------------------------------------------

describe('VaultRegistry.resolve', () => {
  it('resolves by id, then by name', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    const vaultB = await mkTmpDir('vault-b-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', vaultA, 'Alpha Vault'), entry('beta', vaultB, 'Beta Vault')],
    });
    const { registry } = makeRegistry({ configPath });
    expect((await registry.resolve('beta')).id).toBe('beta');
    expect((await registry.resolve('Alpha Vault')).id).toBe('alpha');
  });

  it('throws VaultNotFound with the known ids for an unknown ref', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', vaultA)],
    });
    const { registry } = makeRegistry({ configPath });
    await expect(registry.resolve('nope')).rejects.toThrow(VaultNotFound);
    await expect(registry.resolve('nope')).rejects.toThrow(/alpha/);
  });
});

// ---------------------------------------------------------------------------
// engine — lazy build, cache, invalidate, fail-loud on missing path
// ---------------------------------------------------------------------------

describe('VaultRegistry.engine', () => {
  it('unknown ref throws VaultNotFound', async () => {
    const { registry, buildEngine } = makeRegistry({ configPath });
    await expect(registry.engine('ghost')).rejects.toThrow(VaultNotFound);
    expect(buildEngine).not.toHaveBeenCalled();
  });

  it('registered vault whose path is missing on disk throws VaultPathMissing (never auto-creates)', async () => {
    const gone = path.join(await mkTmpDir(), 'deleted-vault');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('gone', gone)],
    });
    const { registry, buildEngine } = makeRegistry({ configPath });
    await expect(registry.engine('gone')).rejects.toThrow(VaultPathMissing);
    expect(buildEngine).not.toHaveBeenCalled();
    expect(fs.existsSync(gone)).toBe(false); // fail-loud, no auto-create
  });

  it('builds lazily and caches by id — buildEngine called once', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', vaultA)],
    });
    const { registry, buildEngine } = makeRegistry({ configPath });
    expect(buildEngine).not.toHaveBeenCalled();
    const first = await registry.engine('alpha');
    const second = await registry.engine('alpha');
    expect(buildEngine).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('invalidate(id) drops the cached engine and forces a rebuild', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', vaultA)],
    });
    const { registry, buildEngine } = makeRegistry({ configPath });
    const first = await registry.engine('alpha');
    registry.invalidate('alpha');
    const second = await registry.engine('alpha');
    expect(buildEngine).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });
});

// ---------------------------------------------------------------------------
// mutateConfig — lock, atomicity, .bak, validation, transient stripping
// ---------------------------------------------------------------------------

describe('VaultRegistry.mutateConfig', () => {
  it('creates the config dir on first write and persists the mutation', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    const { registry } = makeRegistry({ configPath });
    expect(fs.existsSync(path.dirname(configPath))).toBe(false);
    await registry.mutateConfig((c) => {
      c.vaults.push(entry('alpha', vaultA));
    });
    const onDisk = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    expect(onDisk.vaults.map((v: VaultEntry) => v.id)).toEqual(['alpha']);
    expect((await registry.loadConfig()).vaults.map((v) => v.id)).toEqual(['alpha']);
  });

  it('10 concurrent mutateConfig calls lose no updates (advisory lock)', async () => {
    const vaultDir = await mkTmpDir('vault-shared-');
    const { registry } = makeRegistry({ configPath });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        registry.mutateConfig((c) => {
          c.vaults.push(entry(`vault-${i}`, path.join(vaultDir, `v${i}`)));
        })
      )
    );
    const onDisk = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    const ids = onDisk.vaults.map((v: VaultEntry) => v.id).sort();
    expect(ids).toEqual(
      Array.from({ length: 10 }, (_, i) => `vault-${i}`).sort()
    );
    // Lockfile released.
    expect(fs.existsSync(`${configPath}.lock`)).toBe(false);
  });

  it('writes a .bak of the previous content before each mutation', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    const vaultB = await mkTmpDir('vault-b-');
    const { registry } = makeRegistry({ configPath });
    await registry.mutateConfig((c) => {
      c.vaults.push(entry('alpha', vaultA));
    });
    const afterFirst = await fsp.readFile(configPath, 'utf8');
    await registry.mutateConfig((c) => {
      c.vaults.push(entry('beta', vaultB));
    });
    const bak = await fsp.readFile(`${configPath}.bak`, 'utf8');
    expect(bak).toBe(afterFirst);
    expect(JSON.parse(bak).vaults.map((v: VaultEntry) => v.id)).toEqual(['alpha']);
  });

  it('preserves the original file when the mutation produces an invalid shape', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    await writeConfig(configPath, {
      version: 1,
      allowedRoots: [],
      vaults: [entry('alpha', vaultA)],
    });
    const before = await fsp.readFile(configPath, 'utf8');
    const { registry } = makeRegistry({ configPath });
    await expect(
      registry.mutateConfig((c) => {
        (c as any).vaults = 'garbage';
      })
    ).rejects.toThrow(/invalid/i);
    expect(await fsp.readFile(configPath, 'utf8')).toBe(before);
    expect(fs.existsSync(`${configPath}.lock`)).toBe(false);
  });

  it('never persists transient (absorbed) entries', async () => {
    const envVault = path.join(await mkTmpDir(), 'EnvVault');
    await fsp.mkdir(envVault);
    const vaultA = await mkTmpDir('vault-a-');
    const { registry } = makeRegistry({ configPath, env: { VAULT_PATH: envVault } });
    // The absorbed vault is visible through the merged view...
    expect((await registry.loadConfig()).vaults.some((v) => v.transient)).toBe(true);
    await registry.mutateConfig((c) => {
      c.vaults.push(entry('alpha', vaultA));
      // Even a fn that force-injects a transient entry must not persist it.
      c.vaults.push({ ...entry('sneaky', envVault), transient: true });
    });
    const onDisk = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    expect(onDisk.vaults.map((v: VaultEntry) => v.id)).toEqual(['alpha']);
    expect(onDisk.vaults.some((v: VaultEntry) => v.transient)).toBe(false);
    // ...and it is still visible through the merged view after the write.
    const merged = await registry.loadConfig();
    expect(merged.vaults.map((v) => v.id).sort()).toEqual(['alpha', 'envvault']);
  });

  it('takes over a stale lock (holder died) instead of hanging', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    await fsp.mkdir(path.dirname(configPath), { recursive: true });
    const lockPath = `${configPath}.lock`;
    await fsp.writeFile(lockPath, '999999');
    // Age the lock past the stale threshold (~5s).
    const past = new Date(Date.now() - 60_000);
    await fsp.utimes(lockPath, past, past);
    const { registry } = makeRegistry({ configPath });
    await registry.mutateConfig((c) => {
      c.vaults.push(entry('alpha', vaultA));
    });
    const onDisk = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    expect(onDisk.vaults.map((v: VaultEntry) => v.id)).toEqual(['alpha']);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('a fresh (non-stale) foreign lock is waited on, then acquired after release', async () => {
    const vaultA = await mkTmpDir('vault-a-');
    await fsp.mkdir(path.dirname(configPath), { recursive: true });
    const lockPath = `${configPath}.lock`;
    await fsp.writeFile(lockPath, String(process.pid));
    const { registry } = makeRegistry({ configPath });
    const mutation = registry.mutateConfig((c) => {
      c.vaults.push(entry('alpha', vaultA));
    });
    // Release the foreign lock shortly after — the registry should have been
    // polling rather than clobbering it.
    await new Promise((r) => setTimeout(r, 200));
    expect(fs.existsSync(configPath)).toBe(false); // still blocked
    await fsp.unlink(lockPath);
    await mutation;
    const onDisk = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    expect(onDisk.vaults.map((v: VaultEntry) => v.id)).toEqual(['alpha']);
  });
});
