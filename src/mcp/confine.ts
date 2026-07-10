/**
 * src/mcp/confine.ts — path confinement for agent-supplied paths.
 *
 * Work item W6 of MULTI_VAULT_MCP_IMPLEMENTATION_SPEC.md (§6.2, §4.1, D7).
 * Every path an MCP client can supply (`add_vault.path`, `add_workspace.path`,
 * doc paths in read/list/search) is an arbitrary file read/write primitive
 * unless it is confined to `allowedRoots`. This module is the single choke
 * point: allowlist + realpath (symlink) resolution + config-dir exclusion.
 *
 * Two entry points, wired by the integration wave (W8):
 *  - `confinePath`     — registration time; tolerates not-yet-existing targets
 *                        (add_vault scaffolds new dirs).
 *  - `confineExisting` — access time (read_docs/list_files/search_docs);
 *                        strict: the path must exist and is fully re-realpathed
 *                        so a post-registration symlink swap is caught (TOCTOU).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PathNotConfined } from './types.js';

// =============================================================================
// Global config location (spec §4.1)
// =============================================================================

/**
 * Directory holding the global MCP config: `$XDG_CONFIG_HOME/ostanlabs`
 * (win32 fallback: `%APPDATA%`; else `~/.config`).
 *
 * `env` is read at call time (injectable) so tests can point the config dir
 * anywhere without mutating the real process environment.
 */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const base =
    env.XDG_CONFIG_HOME ??
    (process.platform === 'win32' ? env.APPDATA! : path.join(os.homedir(), '.config'));
  return path.join(base, 'ostanlabs');
}

/** Absolute path of the global `mcp.json` (spec §4.1). */
export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), 'mcp.json');
}

// =============================================================================
// Canonicalization
// =============================================================================

/**
 * Canonicalize a path that may not exist yet: realpath the DEEPEST EXISTING
 * ancestor (resolving every symlink on the way), then re-append the
 * non-existent tail segments. A segment that does not exist on disk cannot be
 * a symlink, so appending it lexically is sound.
 *
 * `path.resolve` runs first, so `..`/`.` are collapsed lexically BEFORE any
 * symlink is followed — the conservative direction: `root/link/..` can never
 * be smuggled through a symlink to reach outside. As defense in depth, any
 * `..`/`.` segment that somehow survives into the tail is rejected.
 */
function canonicalize(input: string, allowedRoots: string[]): string {
  let existing = path.resolve(input);
  const tail: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync(existing);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      // ENOENT/ENOTDIR: this segment doesn't exist (yet) — walk up one level.
      // Anything else (EACCES, ELOOP, ...) is a real failure: stay loud.
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw e;
      const parent = path.dirname(existing);
      if (parent === existing) throw e; // hit the fs root and nothing existed
      const segment = path.basename(existing);
      if (segment === '..' || segment === '.') {
        // Cannot appear after path.resolve — treat survival as an attack.
        throw new PathNotConfined(input, allowedRoots);
      }
      tail.push(segment);
      existing = parent;
    }
  }
}

// =============================================================================
// Confinement checks
// =============================================================================

/**
 * The allowlist + config-dir check shared by both entry points.
 * `real` must already be canonical (symlinks resolved).
 */
function assertConfined(
  input: string,
  real: string,
  allowedRoots: string[],
  env: NodeJS.ProcessEnv
): void {
  // Roots are canonicalized too: a root registered via a symlink (or with a
  // stale /var vs /private/var spelling on macOS) must still match its
  // realpath'd children.
  const roots = allowedRoots.map((r) => canonicalize(r, allowedRoots));

  // `real === root || startsWith(root + sep)` — the separator guard defeats
  // the prefix-sibling attack (/Users/x/Projects admitting /Users/x/Projects-evil).
  // Empty allowedRoots → `some` over [] is false → default-deny everything.
  const ok = roots.some((r) => real === r || real.startsWith(r + path.sep));
  if (!ok) throw new PathNotConfined(input, allowedRoots);

  // Config-dir exclusion: reject the config dir itself, anything inside it
  // (direct mcp.json read/write), and any ANCESTOR of it — a vault registered
  // at ~/.config would let ordinary vault writes clobber mcp.json and thereby
  // widen allowedRoots.
  const cfg = canonicalize(configDir(env), allowedRoots);
  if (real === cfg || real.startsWith(cfg + path.sep) || cfg.startsWith(real + path.sep)) {
    throw new PathNotConfined(input, allowedRoots);
  }
}

/**
 * Registration-time confinement (`add_vault.path`, `add_workspace.path`).
 * The target may not exist yet — see `canonicalize`. Returns the canonical
 * absolute path; throws `PathNotConfined` otherwise.
 */
export function confinePath(
  input: string,
  allowedRoots: string[],
  env: NodeJS.ProcessEnv = process.env
): string {
  const real = canonicalize(input, allowedRoots);
  assertConfined(input, real, allowedRoots, env);
  return real;
}

/**
 * Access-time confinement (read_docs/list_files/search_docs). Strict variant:
 * the path must EXIST and is fully re-realpathed on every call, so a
 * directory that passed at registration and was later swapped for a symlink
 * to /etc (TOCTOU) is caught here. Returns the canonical absolute path.
 */
export function confineExisting(
  input: string,
  allowedRoots: string[],
  env: NodeJS.ProcessEnv = process.env
): string {
  let real: string;
  try {
    real = fs.realpathSync(path.resolve(input));
  } catch {
    // Missing (or unresolvable) path at access time — reject rather than
    // fall back to lexical resolution, which is exactly what TOCTOU abuses.
    throw new PathNotConfined(input, allowedRoots);
  }
  assertConfined(input, real, allowedRoots, env);
  return real;
}

// =============================================================================
// Workspace doc-extension allowlist (spec §6.2: workspaces are docs-only)
// =============================================================================

const DOC_EXTENSIONS = new Set(['.md', '.canvas']);

/**
 * Workspaces may only touch documents — never scripts, keys, or dotfiles.
 * Note: `path.extname('.md')` is `''` (a dotfile has no extension), so a
 * bare `.md`-named dotfile is rejected too.
 */
export function assertDocPath(p: string): void {
  const ext = path.extname(p).toLowerCase();
  if (!DOC_EXTENSIONS.has(ext)) {
    throw new Error(
      `Workspace paths are restricted to ${[...DOC_EXTENSIONS].join('/')} documents — got '${p}'`
    );
  }
}
