/**
 * src/mcp/vault-detect.ts — the adopt-mode layout probe for `add_vault`
 * (MULTI_VAULT_MCP_IMPLEMENTATION_SPEC.md §7.2 steps 2+4; design §10.5; W9).
 *
 * STRICTLY READ-ONLY over the FileSystem: never writes, never mkdirs, never
 * bootstraps a schema (`loadSchemaOrDefault`, NEVER `loadOrBootstrapSchema`).
 * The detector describes the layout ALREADY on disk so the adopter never
 * creates a competing tree beside real data. The production reality it must
 * survive (AgentPlatform): no schema.json, type folders at the TOP LEVEL
 * (`tasks/`, not `entities/tasks/`), a stray half-migrated `entities/tasks`,
 * and MIXED archive layouts (quarterly `archive/2024-Q1/` AND by-type
 * `archive/tasks/`).
 *
 * The fs adapter is assumed rooted at the candidate vault (e.g.
 * `NodeFsAdapter(path)`); all probing uses vault-root-relative paths.
 */

import type { FileEntry, FileSystem, Schema } from '../entity-core/types.js';
import { DEFAULT_SCHEMA } from '../entity-core/default-schema.js';
import { loadSchemaOrDefault } from '../entity-core/schema-bootstrap.js';
import type { ArchiveLayout, VaultDetection } from './types.js';

/** Vault root as seen by a vault-rooted FileSystem adapter. */
const ROOT = '/';
const ARCHIVE_FOLDER = 'archive';
const ENTITIES_FOLDER = 'entities';
const DEFAULT_CANVAS_FOLDER = 'projects';
/** Legacy quarterly archive subdir, e.g. `2024-Q1`. */
const QUARTER_DIR_RE = /^\d{4}-Q[1-4]$/;

// Probe caps — detection stays cheap on huge vaults (§7.2: scan the root
// shallowly + one level into candidate folders; never walk the whole tree).
const MAX_PROBE_DIRS = 12;
const MAX_PROBE_FILES_PER_DIR = 5;
const MAX_PROBE_FILES_TOTAL = 40;

function childPath(dir: string, name: string): string {
  return dir === ROOT ? `${ROOT}${name}` : `${dir}/${name}`;
}

/** readDir that treats unreadable/missing dirs as empty (probe, don't throw). */
async function listDir(fs: FileSystem, dir: string): Promise<FileEntry[]> {
  try {
    return await fs.readDir(dir);
  } catch {
    return [];
  }
}

/** Shallow count of .md files directly inside `dir`. */
async function countMdFiles(fs: FileSystem, dir: string): Promise<number> {
  return (await listDir(fs, dir)).filter((e) => !e.isDirectory && e.name.endsWith('.md')).length;
}

/** True when the content opens a frontmatter block holding both `id:` and `type:`. */
function hasEntityFrontmatter(content: string): boolean {
  if (!/^---\r?\n/.test(content)) return false;
  const close = content.indexOf('\n---', 3);
  const block = close === -1 ? content.slice(0, 2000) : content.slice(0, close);
  return /^id:\s*\S/m.test(block) && /^type:\s*\S/m.test(block);
}

/**
 * Capped evidence probe: root-level .md files first, then one level into the
 * first MAX_PROBE_DIRS non-hidden root folders (≤ MAX_PROBE_FILES_PER_DIR
 * each, ≤ MAX_PROBE_FILES_TOTAL overall).
 */
async function probeEntityFrontmatter(fs: FileSystem, rootEntries: FileEntry[]): Promise<boolean> {
  let filesRead = 0;
  const readAndCheck = async (path: string): Promise<boolean> => {
    filesRead += 1;
    try {
      return hasEntityFrontmatter(await fs.readFile(path));
    } catch {
      return false;
    }
  };

  for (const e of rootEntries) {
    if (e.isDirectory || !e.name.endsWith('.md')) continue;
    if (filesRead >= MAX_PROBE_FILES_TOTAL) return false;
    if (await readAndCheck(childPath(ROOT, e.name))) return true;
  }

  const candidateDirs = rootEntries
    .filter((e) => e.isDirectory && !e.name.startsWith('.'))
    .slice(0, MAX_PROBE_DIRS);
  for (const dir of candidateDirs) {
    const dirPath = childPath(ROOT, dir.name);
    let perDir = 0;
    for (const e of await listDir(fs, dirPath)) {
      if (e.isDirectory || !e.name.endsWith('.md')) continue;
      if (perDir >= MAX_PROBE_FILES_PER_DIR || filesRead >= MAX_PROBE_FILES_TOTAL) break;
      perDir += 1;
      if (await readAndCheck(childPath(dirPath, e.name))) return true;
    }
  }
  return false;
}

/**
 * Probe an existing directory for add_vault's "auto"/adopt decision.
 *
 * - `kind`: 'absent' (root unreadable/missing) | 'empty' | 'vault' | 'non-vault'.
 *   Vault evidence = a schema.json that parses as a schema, OR recognizable
 *   type folders (from `schema`, default DEFAULT_SCHEMA, unioned with a valid
 *   on-disk schema.json), OR any .md whose frontmatter has both `id:` and
 *   `type:` (capped shallow probe).
 * - `entitiesFolder`: '' when type folders sit at the root, 'entities' when
 *   nested. When BOTH exist (a stray half-migrated tree) the side holding
 *   MORE entity .md files wins and the other is still reported in
 *   `typeFolders` so the caller can surface it.
 * - `archiveLayout`: any `archive/<YYYY>-Q<n>` subdir → 'quarterly' (even
 *   when by-type subdirs coexist — the legacy marker, so adopt records the
 *   layout that still needs migration); otherwise 'by-type' (modern default,
 *   also when archive/ is absent).
 * - `canvasFolder`: 'projects' if that folder exists, else the first probed
 *   root folder containing a .canvas file, else 'projects'.
 *
 * `hasSchemaJson` is true whenever schema.json EXISTS (even unparseable), so
 * the adopter knows never to overwrite it; only a VALID one counts as vault
 * evidence. For 'absent'/'empty' roots the layout fields carry the modern
 * scaffold defaults (entities/, by-type, projects).
 */
export async function detectVaultLayout(fs: FileSystem, schema?: Schema): Promise<VaultDetection> {
  const allRootEntries = await listDir(fs, ROOT);
  // Dot-entries (.obsidian/, .git/, .DS_Store) don't count toward vault content:
  // a fresh Obsidian vault containing only .obsidian/ must classify as 'empty'
  // so add_vault "auto" scaffolds into it instead of refusing as 'non-vault'.
  const rootEntries = allRootEntries.filter((e) => !e.name.startsWith('.'));

  if (rootEntries.length === 0) {
    // A dot-entries-only root demonstrably exists — don't re-ask fs.exists.
    let rootExists = allRootEntries.length > 0;
    if (!rootExists) {
      try {
        rootExists = await fs.exists(ROOT);
      } catch {
        rootExists = false;
      }
    }
    return {
      kind: rootExists ? 'empty' : 'absent',
      entitiesFolder: ENTITIES_FOLDER,
      archiveFolder: ARCHIVE_FOLDER,
      archiveLayout: 'by-type',
      canvasFolder: DEFAULT_CANVAS_FOLDER,
      hasSchemaJson: false,
      typeFolders: [],
    };
  }

  // schema.json — read-only load (no bootstrap-write during detection).
  const loaded = await loadSchemaOrDefault(fs, ROOT);
  const schemaFileValid = loaded.source === 'file';
  // Present-but-invalid still counts as "has" (adopt must not overwrite it).
  const hasSchemaJson = schemaFileValid || loaded.errors.length > 0;

  // Recognizable type-folder names: the provided schema (default
  // DEFAULT_SCHEMA) unioned with a valid on-disk schema.json.
  const folderNames = new Set<string>((schema ?? DEFAULT_SCHEMA).entityTypes.map((t) => t.folder));
  if (schemaFileValid) for (const t of loaded.schema.entityTypes) folderNames.add(t.folder);

  const rootDirs = rootEntries.filter((e) => e.isDirectory);
  const rootTypeDirs = rootDirs.filter((e) => folderNames.has(e.name));
  const nestedTypeDirs = rootDirs.some((e) => e.name === ENTITIES_FOLDER)
    ? (await listDir(fs, childPath(ROOT, ENTITIES_FOLDER))).filter(
        (e) => e.isDirectory && folderNames.has(e.name)
      )
    : [];

  // entitiesFolder: when both locations hold type folders (the half-migrated
  // stray), the side with MORE entity .md files is the real tree. Ties break
  // toward 'entities' only when a valid schema.json marks a modern vault;
  // otherwise toward '' (the AgentPlatform reality). With no recognizable
  // folders at all, '' — loose entity files sit at the top level and there is
  // no nested tree to compete with.
  let entitiesFolder = '';
  if (rootTypeDirs.length > 0 && nestedTypeDirs.length > 0) {
    let rootCount = 0;
    for (const d of rootTypeDirs) rootCount += await countMdFiles(fs, childPath(ROOT, d.name));
    let nestedCount = 0;
    for (const d of nestedTypeDirs) {
      nestedCount += await countMdFiles(fs, `${childPath(ROOT, ENTITIES_FOLDER)}/${d.name}`);
    }
    if (nestedCount > rootCount || (nestedCount === rootCount && schemaFileValid)) {
      entitiesFolder = ENTITIES_FOLDER;
    }
  } else if (nestedTypeDirs.length > 0) {
    entitiesFolder = ENTITIES_FOLDER;
  }

  // ALL on-disk type folders (both locations), so the caller can surface the
  // losing/stray tree. Sorted for deterministic output.
  const typeFolders = [
    ...rootTypeDirs.map((e) => e.name),
    ...nestedTypeDirs.map((e) => `${ENTITIES_FOLDER}/${e.name}`),
  ].sort();

  // archiveLayout: quarterly subdirs win even when by-type subdirs coexist —
  // the conservative legacy marker, so adopt records the layout that still
  // needs migration. No archive/ (or nothing recognizable) → modern 'by-type'.
  let archiveLayout: ArchiveLayout = 'by-type';
  if (rootDirs.some((e) => e.name === ARCHIVE_FOLDER)) {
    const archiveSubdirs = await listDir(fs, childPath(ROOT, ARCHIVE_FOLDER));
    if (archiveSubdirs.some((e) => e.isDirectory && QUARTER_DIR_RE.test(e.name))) {
      archiveLayout = 'quarterly';
    }
  }

  // canvasFolder: projects/ if present; else the first probed root folder
  // holding a .canvas file; else the 'projects' default.
  let canvasFolder = DEFAULT_CANVAS_FOLDER;
  if (!rootDirs.some((e) => e.name === DEFAULT_CANVAS_FOLDER)) {
    for (const d of rootDirs.slice(0, MAX_PROBE_DIRS)) {
      const entries = await listDir(fs, childPath(ROOT, d.name));
      if (entries.some((e) => !e.isDirectory && e.name.endsWith('.canvas'))) {
        canvasFolder = d.name;
        break;
      }
    }
  }

  // Evidence, cheapest first — the file-content probe only runs when neither
  // a valid schema.json nor a recognizable type folder settled it.
  const isVault =
    schemaFileValid || typeFolders.length > 0 || (await probeEntityFrontmatter(fs, rootEntries));

  return {
    kind: isVault ? 'vault' : 'non-vault',
    entitiesFolder,
    archiveFolder: ARCHIVE_FOLDER,
    archiveLayout,
    canvasFolder,
    hasSchemaJson,
    typeFolders,
  };
}
