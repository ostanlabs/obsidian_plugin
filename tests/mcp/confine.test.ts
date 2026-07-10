/**
 * W6 — path confinement (spec §6.2, §4.1, D7).
 *
 * Security suite: exercises the real filesystem with real symlinks, because
 * the module's whole job is defeating realpath/symlink/TOCTOU attacks that
 * an in-memory fake cannot reproduce. Symlink cases are skipped on win32
 * (symlink creation needs elevation there).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  confinePath,
  confineExisting,
  resolveConfigPath,
  configDir,
  assertDocPath,
} from '../../src/mcp/confine.js';
import { PathNotConfined } from '../../src/mcp/types.js';

const isWin = process.platform === 'win32';

// Canonicalized temp roots (mkdtemp on macOS returns /var/... which realpaths
// to /private/var/... — canonicalize up front so expected values compare clean).
let root: string; // the allowed root
let outside: string; // a temp dir NOT in allowedRoots (attack target + fake XDG home)
let env: NodeJS.ProcessEnv; // injected env: config dir safely outside `root`

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'confine-root-')));
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'confine-out-')));
  env = { XDG_CONFIG_HOME: path.join(outside, 'xdg') };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
  // sibling-prefix attack dir created by some tests
  fs.rmSync(`${root}-evil`, { recursive: true, force: true });
});

describe('resolveConfigPath / configDir', () => {
  it('honors XDG_CONFIG_HOME', () => {
    const fake = { XDG_CONFIG_HOME: path.join(outside, 'custom-xdg') };
    expect(configDir(fake)).toBe(path.join(outside, 'custom-xdg', 'ostanlabs'));
    expect(resolveConfigPath(fake)).toBe(
      path.join(outside, 'custom-xdg', 'ostanlabs', 'mcp.json')
    );
  });

  it.skipIf(isWin)('falls back to ~/.config when XDG_CONFIG_HOME is unset', () => {
    expect(resolveConfigPath({})).toBe(
      path.join(os.homedir(), '.config', 'ostanlabs', 'mcp.json')
    );
  });

  it('reads the ambient process.env by default', () => {
    const prev = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(outside, 'ambient-xdg');
    try {
      expect(resolveConfigPath()).toBe(
        path.join(outside, 'ambient-xdg', 'ostanlabs', 'mcp.json')
      );
    } finally {
      if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prev;
    }
  });
});

describe('confinePath — allowlist basics', () => {
  it('accepts a path inside an allowed root and returns the canonical path', () => {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'a.md'), 'x');
    expect(confinePath(path.join(root, 'docs', 'a.md'), [root], env)).toBe(
      path.join(root, 'docs', 'a.md')
    );
  });

  it('accepts the exact allowed root itself', () => {
    expect(confinePath(root, [root], env)).toBe(root);
  });

  it('rejects a sibling directory that shares the root as a string prefix', () => {
    // /Users/x/Projects-evil must NOT pass a check against /Users/x/Projects.
    fs.mkdirSync(`${root}-evil`);
    fs.writeFileSync(path.join(`${root}-evil`, 'f'), 'x');
    expect(() => confinePath(path.join(`${root}-evil`, 'f'), [root], env)).toThrow(
      PathNotConfined
    );
  });

  it('rejects a path outside every allowed root', () => {
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
    expect(() => confinePath(path.join(outside, 'secret.txt'), [root], env)).toThrow(
      PathNotConfined
    );
  });

  it('rejects everything when allowedRoots is empty (default-deny)', () => {
    expect(() => confinePath(root, [], env)).toThrow(PathNotConfined);
    expect(() => confinePath('/etc', [], env)).toThrow(PathNotConfined);
  });

  it('rejects .. traversal that escapes the root', () => {
    expect(() => confinePath(`${root}/a/../../etc`, [root], env)).toThrow(PathNotConfined);
  });

  it('normalizes .. traversal that stays inside the root', () => {
    expect(confinePath(`${root}/a/../b`, [root], env)).toBe(path.join(root, 'b'));
  });

  it.skipIf(isWin)('canonicalizes allowedRoots themselves (root given via symlink)', () => {
    // Root registered through a symlink must still admit the real path.
    const link = path.join(outside, 'rootlink');
    fs.symlinkSync(root, link);
    fs.writeFileSync(path.join(root, 'f.md'), 'x');
    expect(confinePath(path.join(root, 'f.md'), [link], env)).toBe(path.join(root, 'f.md'));
  });
});

describe('confinePath — non-existent targets (add_vault scaffolds new dirs)', () => {
  it('accepts a non-existent path under an allowed root with the correct canonical result', () => {
    const target = path.join(root, 'new', 'vault');
    expect(confinePath(target, [root], env)).toBe(target);
  });

  it('rejects a non-existent path outside every allowed root', () => {
    expect(() => confinePath(path.join(outside, 'new', 'vault'), [root], env)).toThrow(
      PathNotConfined
    );
  });

  it.skipIf(isWin)(
    'realpaths the deepest existing ancestor: non-existent tail under an escaping symlink is rejected',
    () => {
      // root/sub -> outside; root/sub/anything must resolve via the symlink and fail.
      fs.symlinkSync(outside, path.join(root, 'sub'));
      expect(() => confinePath(path.join(root, 'sub', 'newdir'), [root], env)).toThrow(
        PathNotConfined
      );
    }
  );
});

describe('confinePath — symlink escapes', () => {
  it.skipIf(isWin)('rejects a symlinked FILE inside the root pointing outside', () => {
    fs.writeFileSync(path.join(outside, 'secret.md'), 'x');
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'link.md'));
    expect(() => confinePath(path.join(root, 'link.md'), [root], env)).toThrow(PathNotConfined);
  });

  it.skipIf(isWin)('rejects a symlinked DIRECTORY component escaping the root', () => {
    fs.symlinkSync(outside, path.join(root, 'sub'));
    fs.writeFileSync(path.join(outside, 'file.md'), 'x');
    expect(() => confinePath(path.join(root, 'sub', 'file.md'), [root], env)).toThrow(
      PathNotConfined
    );
  });

  it.skipIf(isWin)('accepts a symlink that stays inside the root', () => {
    fs.mkdirSync(path.join(root, 'real'));
    fs.symlinkSync(path.join(root, 'real'), path.join(root, 'alias'));
    expect(confinePath(path.join(root, 'alias'), [root], env)).toBe(path.join(root, 'real'));
  });
});

describe('confineExisting — TOCTOU (access-time re-check)', () => {
  it.skipIf(isWin)(
    'rejects a registered dir later swapped for a symlink pointing outside',
    () => {
      const vault = path.join(root, 'vault');
      fs.mkdirSync(vault);
      // Registration time: legitimate — passes.
      expect(confinePath(vault, [root], env)).toBe(vault);
      // Attack: swap the dir for a symlink to a sensitive location.
      fs.rmdirSync(vault);
      fs.symlinkSync(outside, vault);
      // Access time: full re-realpath catches the swap.
      expect(() => confineExisting(vault, [root], env)).toThrow(PathNotConfined);
    }
  );

  it('accepts an existing legitimate path and returns the canonical path', () => {
    const vault = path.join(root, 'vault');
    fs.mkdirSync(vault);
    expect(confineExisting(vault, [root], env)).toBe(vault);
  });

  it('rejects a non-existent path even under an allowed root (strict: must exist)', () => {
    expect(() => confineExisting(path.join(root, 'missing'), [root], env)).toThrow(
      PathNotConfined
    );
  });

  it('rejects an existing path outside every allowed root', () => {
    expect(() => confineExisting(outside, [root], env)).toThrow(PathNotConfined);
  });
});

describe('confinePath — config-dir overlap', () => {
  // Fake config dir INSIDE the allowed root: <root>/cfg/ostanlabs — the exact
  // scenario where a vault registration would put mcp.json in agent reach.
  let cfgEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    cfgEnv = { XDG_CONFIG_HOME: path.join(root, 'cfg') };
    fs.mkdirSync(path.join(root, 'cfg', 'ostanlabs'), { recursive: true });
  });

  it('rejects the config dir itself', () => {
    expect(() => confinePath(path.join(root, 'cfg', 'ostanlabs'), [root], cfgEnv)).toThrow(
      PathNotConfined
    );
  });

  it('rejects a child of the config dir', () => {
    expect(() =>
      confinePath(path.join(root, 'cfg', 'ostanlabs', 'mcp.json'), [root], cfgEnv)
    ).toThrow(PathNotConfined);
  });

  it('rejects an ancestor of the config dir (vault at ~/.config could clobber mcp.json)', () => {
    expect(() => confinePath(path.join(root, 'cfg'), [root], cfgEnv)).toThrow(PathNotConfined);
    // The root itself is also an ancestor of <root>/cfg/ostanlabs here.
    expect(() => confinePath(root, [root], cfgEnv)).toThrow(PathNotConfined);
  });

  it('accepts a sibling-prefix of the config dir (ostanlabs-evil does not overlap)', () => {
    fs.mkdirSync(path.join(root, 'cfg', 'ostanlabs-evil'));
    expect(confinePath(path.join(root, 'cfg', 'ostanlabs-evil'), [root], cfgEnv)).toBe(
      path.join(root, 'cfg', 'ostanlabs-evil')
    );
  });

  it('confineExisting applies the same config-dir rejection', () => {
    expect(() =>
      confineExisting(path.join(root, 'cfg', 'ostanlabs'), [root], cfgEnv)
    ).toThrow(PathNotConfined);
  });
});

describe('assertDocPath — workspace doc-extension allowlist', () => {
  it('accepts .md and .canvas (case-insensitive)', () => {
    expect(() => assertDocPath('notes/a.md')).not.toThrow();
    expect(() => assertDocPath('boards/b.canvas')).not.toThrow();
    expect(() => assertDocPath('SHOUTY/A.MD')).not.toThrow();
  });

  it('rejects every other extension and extension-less paths', () => {
    expect(() => assertDocPath('script.sh')).toThrow();
    expect(() => assertDocPath('id_rsa')).toThrow();
    expect(() => assertDocPath('trick.md.exe')).toThrow();
    expect(() => assertDocPath('.md')).toThrow(); // dotfile named ".md" has no extension
  });
});
