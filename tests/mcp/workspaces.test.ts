/**
 * W7 — per-vault workspaces.json management (spec §8, D1, §15 W7).
 *
 * Runs on the in-memory harness with a STUB confine: confinement itself is
 * W6's problem (src/mcp/confine.ts); this suite only asserts that workspaces.ts
 * calls the injected confine at the right times and stores/returns its RESULT.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryFileSystem } from '../entity-core/harness/in-memory-fs.js';
import type { Workspaces } from '../../src/mcp/types.js';
import {
  WORKSPACES_FILE,
  readWorkspaces,
  writeWorkspaces,
  addWorkspace,
  removeWorkspace,
  resolveWorkspace,
} from '../../src/mcp/workspaces.js';

/** Stub confine: records calls, "canonicalizes" by prefixing /real, and
 * rejects anything under /forbidden (simulating an allowedRoots violation). */
function makeConfine() {
  const calls: string[] = [];
  const confine = (p: string): string => {
    calls.push(p);
    if (p.includes('/forbidden')) {
      throw new Error(`Path not within allowedRoots: ${p}`);
    }
    return `/real${p}`;
  };
  return { confine, calls };
}

describe('W7. workspaces.json — readWorkspaces', () => {
  it('returns {} when the file is absent', async () => {
    const fs = new InMemoryFileSystem();
    await expect(readWorkspaces(fs)).resolves.toEqual({});
  });

  it('parses a present, valid file', async () => {
    const fs = new InMemoryFileSystem({
      [WORKSPACES_FILE]: JSON.stringify({
        docs: { path: '/real/docs', description: 'External docs' },
        api: { path: '/real/api' },
      }),
    });
    const ws = await readWorkspaces(fs);
    expect(ws).toEqual({
      docs: { path: '/real/docs', description: 'External docs' },
      api: { path: '/real/api' },
    });
  });

  it('throws loudly on corrupt JSON — never silently returns {}', async () => {
    const fs = new InMemoryFileSystem({ [WORKSPACES_FILE]: '{ not json !!!' });
    await expect(readWorkspaces(fs)).rejects.toThrow(/workspaces\.json.*corrupt/i);
  });

  it.each([
    ['array', '[1, 2]'],
    ['string', '"hello"'],
    ['null', 'null'],
    ['number', '42'],
  ])('throws loudly on non-object top-level shape (%s)', async (_label, raw) => {
    const fs = new InMemoryFileSystem({ [WORKSPACES_FILE]: raw });
    await expect(readWorkspaces(fs)).rejects.toThrow(/workspaces\.json.*corrupt/i);
  });

  it('throws loudly when an entry is missing a string path', async () => {
    const fs = new InMemoryFileSystem({
      [WORKSPACES_FILE]: JSON.stringify({ bad: { description: 'no path here' } }),
    });
    await expect(readWorkspaces(fs)).rejects.toThrow(/workspaces\.json.*corrupt.*bad/i);
  });
});

describe('W7. workspaces.json — writeWorkspaces', () => {
  it('round-trips through read and leaves no .tmp file behind', async () => {
    const fs = new InMemoryFileSystem();
    const ws: Workspaces = {
      docs: { path: '/real/docs', description: 'External docs' },
    };
    await writeWorkspaces(fs, ws);
    expect(await readWorkspaces(fs)).toEqual(ws);
    expect(fs.allPaths()).toContain(WORKSPACES_FILE);
    expect(fs.allPaths().filter((p) => p.endsWith('.tmp'))).toEqual([]);
  });

  it('writes via tmp + rename (overwrite of an existing file)', async () => {
    const fs = new InMemoryFileSystem({ [WORKSPACES_FILE]: '{}' });
    await writeWorkspaces(fs, { a: { path: '/real/a' } });
    expect(JSON.parse(await fs.readFile(WORKSPACES_FILE))).toEqual({
      a: { path: '/real/a' },
    });
    expect(fs.allPaths().filter((p) => p.endsWith('.tmp'))).toEqual([]);
  });
});

describe('W7. workspaces.json — addWorkspace', () => {
  it('confines the supplied path and stores the CONFINED value', async () => {
    const fs = new InMemoryFileSystem();
    const { confine, calls } = makeConfine();
    const ws = await addWorkspace(
      fs,
      { name: 'docs', path: '/vaults/docs', description: 'External docs' },
      confine
    );
    expect(calls).toEqual(['/vaults/docs']);
    // The stub's RETURN value ('/real' + input), not the raw input, is stored.
    expect(ws.docs).toEqual({ path: '/real/vaults/docs', description: 'External docs' });
    // And it is persisted, not just returned.
    expect(await readWorkspaces(fs)).toEqual(ws);
  });

  it('omits description when not provided', async () => {
    const fs = new InMemoryFileSystem();
    const { confine } = makeConfine();
    const ws = await addWorkspace(fs, { name: 'api', path: '/vaults/api' }, confine);
    expect(ws.api).toEqual({ path: '/real/vaults/api' });
    expect('description' in ws.api).toBe(false);
  });

  it('throws on duplicate name — no silent overwrite, file untouched', async () => {
    const fs = new InMemoryFileSystem();
    const { confine } = makeConfine();
    await addWorkspace(fs, { name: 'docs', path: '/vaults/docs' }, confine);
    await expect(
      addWorkspace(fs, { name: 'docs', path: '/vaults/other' }, confine)
    ).rejects.toThrow(/docs.*already/i);
    expect(await readWorkspaces(fs)).toEqual({ docs: { path: '/real/vaults/docs' } });
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['forward slash', 'a/b'],
    ['backslash', 'a\\b'],
  ])('rejects invalid workspace name (%s) without calling confine', async (_label, name) => {
    const fs = new InMemoryFileSystem();
    const { confine, calls } = makeConfine();
    await expect(addWorkspace(fs, { name, path: '/vaults/docs' }, confine)).rejects.toThrow(
      /workspace name/i
    );
    expect(calls).toEqual([]);
    expect(await readWorkspaces(fs)).toEqual({});
  });

  it('propagates confine rejection and persists nothing', async () => {
    const fs = new InMemoryFileSystem();
    const { confine } = makeConfine();
    await expect(
      addWorkspace(fs, { name: 'evil', path: '/forbidden/secrets' }, confine)
    ).rejects.toThrow(/not within allowedRoots/);
    expect(await readWorkspaces(fs)).toEqual({});
  });
});

describe('W7. workspaces.json — removeWorkspace', () => {
  it('removes an existing workspace, persists, and returns the updated map', async () => {
    const fs = new InMemoryFileSystem();
    const { confine } = makeConfine();
    await addWorkspace(fs, { name: 'docs', path: '/vaults/docs' }, confine);
    await addWorkspace(fs, { name: 'api', path: '/vaults/api' }, confine);
    const ws = await removeWorkspace(fs, 'docs');
    expect(ws).toEqual({ api: { path: '/real/vaults/api' } });
    expect(await readWorkspaces(fs)).toEqual(ws);
  });

  it('throws on a missing name, listing the existing names', async () => {
    const fs = new InMemoryFileSystem();
    const { confine } = makeConfine();
    await addWorkspace(fs, { name: 'alpha', path: '/vaults/a' }, confine);
    await addWorkspace(fs, { name: 'beta', path: '/vaults/b' }, confine);
    await expect(removeWorkspace(fs, 'gamma')).rejects.toThrow(/gamma.*alpha, beta/);
  });

  it('throws with "none" when no workspaces exist at all', async () => {
    const fs = new InMemoryFileSystem();
    await expect(removeWorkspace(fs, 'anything')).rejects.toThrow(/none/i);
  });
});

describe('W7. workspaces.json — resolveWorkspace', () => {
  it('re-invokes confine at access time (TOCTOU defense)', async () => {
    const fs = new InMemoryFileSystem();
    const { confine, calls } = makeConfine();
    await addWorkspace(fs, { name: 'docs', path: '/vaults/docs', description: 'd' }, confine);
    expect(calls).toHaveLength(1);

    const ws = await readWorkspaces(fs);
    const resolved = resolveWorkspace(ws, 'docs', confine);
    // Confine was called AGAIN, on the STORED (already-confined) path.
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe('/real/vaults/docs');
    expect(resolved).toEqual({ path: '/real/real/vaults/docs', description: 'd' });
  });

  it('throws if the stored path no longer passes confinement', () => {
    const { confine } = makeConfine();
    const ws: Workspaces = { evil: { path: '/forbidden/moved-here' } };
    expect(() => resolveWorkspace(ws, 'evil', confine)).toThrow(/not within allowedRoots/);
  });

  it('throws on a missing name, listing the valid names', () => {
    const { confine, calls } = makeConfine();
    const ws: Workspaces = {
      alpha: { path: '/real/a' },
      beta: { path: '/real/b' },
    };
    expect(() => resolveWorkspace(ws, 'gamma', confine)).toThrow(/gamma.*alpha, beta/);
    expect(calls).toEqual([]);
  });
});

describe('W7. workspaces.json — full round-trip', () => {
  it('add → read → remove → read', async () => {
    const fs = new InMemoryFileSystem();
    const { confine } = makeConfine();

    await addWorkspace(fs, { name: 'docs', path: '/vaults/docs', description: 'x' }, confine);
    expect(await readWorkspaces(fs)).toEqual({
      docs: { path: '/real/vaults/docs', description: 'x' },
    });

    await removeWorkspace(fs, 'docs');
    expect(await readWorkspaces(fs)).toEqual({});
    expect(fs.allPaths().filter((p) => p.endsWith('.tmp'))).toEqual([]);
  });
});
