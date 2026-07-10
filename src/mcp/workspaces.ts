/**
 * src/mcp/workspaces.ts — per-vault `<vault>/workspaces.json` management.
 *
 * Spec §8 / D1 / §15 W7 (MULTI_VAULT_MCP_IMPLEMENTATION_SPEC.md): a workspace
 * is a named external doc-source pointer (`{name: {path, description?}}`),
 * stored per-vault and mutated via write-rename. Net-new — nothing else reads
 * or writes workspaces.json.
 *
 * Confinement is INJECTED (`confine: (p: string) => string`, W6's
 * `confinePath` partially applied by the integration layer):
 *   - `addWorkspace` confines at registration time and stores the CONFINED
 *     (canonical) path.
 *   - `resolveWorkspace` RE-confines the stored path at access time (TOCTOU
 *     defense, D7) — a path that was inside allowedRoots when registered may
 *     have been symlink-swapped since.
 *
 * The doc-extension allowlist (.md/.canvas) is enforced at file-READ time by
 * the doc tools, not here.
 *
 * The FileSystem is vault-rooted (NodeFsAdapter resolves against the vault
 * root), so WORKSPACES_FILE is a vault-relative path.
 */

import type { FileSystem } from '../entity-core/types.js';
import type { Workspaces } from './types.js';

export const WORKSPACES_FILE = 'workspaces.json';
const WORKSPACES_TMP_FILE = `${WORKSPACES_FILE}.tmp`;

/** workspaces.json exists but is unreadable/malformed. Fail-loud (spec §10):
 * never silently treat a corrupt file as empty — that would let a later write
 * wipe every registered workspace. Same principle as ConfigCorrupt. */
export class WorkspacesCorrupt extends Error {
  constructor(cause: string) {
    super(
      `${WORKSPACES_FILE} is corrupt: ${cause}. ` +
        `Refusing to treat it as empty — fix or delete the file, then retry. ` +
        `Expected shape: {"<name>": {"path": "<abs path>", "description?": "<text>"}}.`
    );
    this.name = 'WorkspacesCorrupt';
  }
}

export class WorkspaceNotFound extends Error {
  constructor(name: string, known: string[]) {
    super(
      `Workspace '${name}' does not exist ` +
        `(known: ${known.length ? known.join(', ') : 'none'}). Call list_workspaces.`
    );
    this.name = 'WorkspaceNotFound';
  }
}

function has(ws: Workspaces, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ws, name);
}

/** Validate the parsed top-level shape. Throws WorkspacesCorrupt on anything
 * that isn't `Record<string, {path: string, description?: string}>`. */
function assertWorkspacesShape(parsed: unknown): asserts parsed is Workspaces {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WorkspacesCorrupt(`top-level value must be an object, got ${
      parsed === null ? 'null' : Array.isArray(parsed) ? 'an array' : typeof parsed
    }`);
  }
  for (const [name, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new WorkspacesCorrupt(`entry '${name}' must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== 'string' || e.path.length === 0) {
      throw new WorkspacesCorrupt(`entry '${name}' is missing a non-empty string 'path'`);
    }
    if (e.description !== undefined && typeof e.description !== 'string') {
      throw new WorkspacesCorrupt(`entry '${name}' has a non-string 'description'`);
    }
  }
}

/** Read `<vault>/workspaces.json`. Absent file → {} (a vault with no
 * workspaces is normal). Corrupt file → WorkspacesCorrupt, loudly. */
export async function readWorkspaces(fs: FileSystem): Promise<Workspaces> {
  if (!(await fs.exists(WORKSPACES_FILE))) return {};
  const raw = await fs.readFile(WORKSPACES_FILE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new WorkspacesCorrupt(`invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  assertWorkspacesShape(parsed);
  return parsed;
}

/** Persist the map atomically-ish: write `workspaces.json.tmp`, then rename
 * over the target so readers never observe a half-written file. */
export async function writeWorkspaces(fs: FileSystem, ws: Workspaces): Promise<void> {
  await fs.writeFile(WORKSPACES_TMP_FILE, JSON.stringify(ws, null, 2) + '\n');
  await fs.renameFile(WORKSPACES_TMP_FILE, WORKSPACES_FILE);
}

/** Register a workspace: validate the name, confine the supplied path, and
 * store the CONFINED (canonical) result. Duplicate names throw — removing
 * first is an explicit, auditable act. Returns the persisted map. */
export async function addWorkspace(
  fs: FileSystem,
  workspace: { name: string; path: string; description?: string },
  confine: (p: string) => string
): Promise<Workspaces> {
  const { name, path, description } = workspace;
  if (name.trim().length === 0) {
    throw new Error(`Invalid workspace name: must be non-empty.`);
  }
  if (name.includes('/') || name.includes('\\')) {
    throw new Error(
      `Invalid workspace name '${name}': path separators are not allowed — a workspace name is a label, not a path.`
    );
  }
  const ws = await readWorkspaces(fs);
  if (has(ws, name)) {
    throw new Error(
      `Workspace '${name}' already exists (path: ${ws[name].path}). ` +
        `No silent overwrite — remove_workspace it first if you want to repoint it.`
    );
  }
  const confined = confine(path);
  const updated: Workspaces = {
    ...ws,
    [name]: description !== undefined ? { path: confined, description } : { path: confined },
  };
  await writeWorkspaces(fs, updated);
  return updated;
}

/** Unregister a workspace. Missing name throws with the known names (never a
 * silent no-op). Returns the persisted map. */
export async function removeWorkspace(fs: FileSystem, name: string): Promise<Workspaces> {
  const ws = await readWorkspaces(fs);
  if (!has(ws, name)) {
    throw new WorkspaceNotFound(name, Object.keys(ws));
  }
  const { [name]: _removed, ...updated } = ws;
  await writeWorkspaces(fs, updated);
  return updated;
}

/** Access-time lookup for read_docs/search_docs/update_doc scoping. RE-runs
 * confinement on the stored path (TOCTOU defense — registration-time
 * confinement alone is not enough; the target may have been swapped since). */
export function resolveWorkspace(
  ws: Workspaces,
  name: string,
  confine: (p: string) => string
): { path: string; description?: string } {
  if (!has(ws, name)) {
    throw new WorkspaceNotFound(name, Object.keys(ws));
  }
  const entry = ws[name];
  const path = confine(entry.path);
  return entry.description !== undefined ? { path, description: entry.description } : { path };
}
