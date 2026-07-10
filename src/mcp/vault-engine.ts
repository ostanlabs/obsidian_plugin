/**
 * src/mcp/vault-engine.ts — per-vault engine factory (spec §5.2, work items W3/W4).
 *
 * `buildVaultEngine(entry)` is a PORT of mcp.ts's current single-vault wiring
 * into a per-vault struct: NodeFsAdapter(entry.path) → loadOrBootstrapSchema →
 * applySchema (rebuilds every schema-derived module, incl. the pathResolver —
 * the v1.9.0 stale-resolver fix) → schema-derived scanIndex (archive first +
 * recursive — BUG-3) → lazy msrl(). mcp.ts keeps its own module-level copies of
 * the ported helpers until the W8 integration wave deletes them — the
 * duplication is expected and temporary.
 *
 * Also home of the parameterized bootstrap helpers (`ensureDefaultCanvas`,
 * `ensurePluginInstalled`) and the `archiveEntity` copy→verify→delete helper
 * (spec D5/§9.2 semantics: never overwrite, never delete before verifying).
 */

import { NodeFsAdapter } from '../adapters/node-fs-adapter.js';
import { SchemaRegistry } from '../entity-core/schema-registry.js';
import { EntityParser } from '../entity-core/parser.js';
import { EntitySerializer } from '../entity-core/serializer.js';
import { EntityValidator } from '../entity-core/validator.js';
import { IDAllocator } from '../entity-core/id-allocator.js';
import { PathResolver, type PathResolverConfig } from '../entity-core/path-resolver.js';
import { ProjectIndex } from '../entity-core/project-index.js';
import { RelationshipGraph } from '../entity-core/relationship-graph.js';
import { CanvasManager } from '../entity-core/canvas.js';
import { loadOrBootstrapSchema } from '../entity-core/schema-bootstrap.js';
import {
  buildValidationAllowList,
  buildReverseRelationMap,
} from '../entity-core/schema-derivation.js';
import type {
  Schema,
  FileSystem,
  EntityId,
  EntityMetadata,
  RuntimeEntity,
} from '../entity-core/types.js';
import type { VaultEntry, VaultEngine } from './types.js';
// Type-only: the real module has native deps (onnxruntime/faiss) that must not
// load under vitest — the runtime import is dynamic, inside msrl().
import type { MsrlEngine } from '@ostanlabs/md-retriever';

// =============================================================================
// Overrides (test seam) + engine surface
// =============================================================================

export interface VaultEngineOverrides {
  /** Inject a FileSystem (the in-memory test harness). Default: NodeFsAdapter(entry.path). */
  fs?: FileSystem;
  /** Inject an MSRL factory (tests). Default: dynamic-import MsrlEngine.create. */
  msrlFactory?: (entry: VaultEntry) => Promise<MsrlEngine>;
}

/**
 * The Node engine adds the validation allow-list to the shared contract — the
 * W8 mcp.ts integration reads it per-vault (it was module-level
 * VALIDATION_ALLOWLIST in single-vault mcp.ts).
 */
export interface NodeVaultEngine extends VaultEngine {
  validationAllowList: Record<string, Record<string, string[]>>;
}

// =============================================================================
// Ported helpers (verbatim semantics from mcp.ts — module copies remain there
// until the W8 integration wave deletes them)
// =============================================================================

/**
 * Recursively list files under a folder (readDir-based; [] when the folder is
 * missing). The archive folder nests by type/quarter (see archiveLayout and
 * cleanup_completed, which writes archive/<type>/…), so a flat scan silently
 * missed archived entities in subfolders — BUG-3: they were then unreachable
 * by id ("Entity not found") for reads and updates alike. (Port of mcp.ts:184.)
 */
async function listFilesRecursive(fs: FileSystem, folder: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readDir(dir)) {
      if (entry.isDirectory) await walk(entry.path);
      else out.push(entry.path);
    }
  };
  await walk(folder);
  return out;
}

/**
 * Flat (non-recursive) file listing — the FileSystem-interface equivalent of
 * NodeFsAdapter.listFiles (files only, [] when the folder is missing), used
 * for type folders which are flat by contract.
 */
async function listFilesFlat(fs: FileSystem, folder: string): Promise<string[]> {
  return (await fs.readDir(folder)).filter((e) => !e.isDirectory).map((e) => e.path);
}

/** Build EntityMetadata from RuntimeEntity. (Port of mcp.ts:203.) */
function buildMetadata(entity: RuntimeEntity, filePath: string, mtimeMs: number): EntityMetadata {
  // Extract parent from relationships
  const parentRel = entity.relationships?.parent;
  const parent_id = Array.isArray(parentRel) ? parentRel[0] : parentRel;

  // Count children
  const childrenRel = entity.relationships?.children;
  const children_count = Array.isArray(childrenRel) ? childrenRel.length : (childrenRel ? 1 : 0);

  // Check if in progress
  const in_progress = entity.status === 'In Progress' || entity.status === 'In-progress';

  return {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    workstream: entity.workstream || '',
    status: entity.status,
    archived: entity.archived,
    in_progress,
    parent_id,
    children_count,
    priority: entity.fields?.priority as string | undefined,
    canvas_source: '', // Not applicable for MCP
    vault_path: filePath,
    file_mtime: mtimeMs,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
  };
}

/** Everything after the frontmatter block (leading newline preserved verbatim).
 * (Port of mcp.ts:135 — BUG A: frontmatter-only rewrites destroyed bodies.) */
function extractBody(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : '';
}

// =============================================================================
// buildVaultEngine — the per-vault port of mcp.ts's single-vault wiring
// =============================================================================

export async function buildVaultEngine(
  entry: VaultEntry,
  overrides?: VaultEngineOverrides
): Promise<NodeVaultEngine> {
  const fs = overrides?.fs ?? new NodeFsAdapter(entry.path);

  // SINGLE SOURCE OF TRUTH: the active schema comes from <entry.path>/schema.json,
  // bootstrapped from DEFAULT_SCHEMA on first run. The fs is rooted at the vault,
  // so schema.json is addressed relative to it ('').
  const loaded = await loadOrBootstrapSchema(fs, '');

  // Path routing derives from the ENTRY's persisted layout fields (real vaults
  // use non-default layouts — AgentPlatform: entitiesFolder '' = top-level folders).
  const resolverConfig: PathResolverConfig = {
    vaultPath: entry.path,
    entitiesFolder: entry.entitiesFolder,
    archiveFolder: entry.archiveFolder,
    canvasFolder: entry.canvasFolder,
  };

  const index = new ProjectIndex(buildReverseRelationMap(loaded.schema));

  // Lazy per-vault MSRL (sharing the embedding session across vaults is a later
  // wave). The promise is cached so concurrent callers share one create().
  let msrlPromise: Promise<MsrlEngine> | null = null;

  const engine: NodeVaultEngine = {
    entry,
    fs,
    index,
    schemaSource: loaded.source,
    schemaErrors: loaded.errors,
    activeSchema: loaded.schema,
    // Schema-derived members — assigned for real by applySchema(loaded.schema) below.
    schema: undefined as unknown as SchemaRegistry,
    parser: undefined as unknown as EntityParser,
    serializer: undefined as unknown as EntitySerializer,
    validator: undefined as unknown as EntityValidator,
    pathResolver: undefined as unknown as PathResolver,
    allocator: undefined as unknown as IDAllocator,
    relationshipGraph: undefined as unknown as RelationshipGraph,
    canvasManager: undefined as unknown as CanvasManager,
    validationAllowList: {},

    /** Rebuild every schema-derived engine object from a schema. (Port of mcp.ts:65-75.) */
    applySchema(s: Schema): void {
      engine.schema = new SchemaRegistry(s);
      engine.parser = new EntityParser(engine.schema);
      engine.serializer = new EntitySerializer(engine.schema);
      engine.validator = new EntityValidator(engine.schema);
      engine.validationAllowList = buildValidationAllowList(s);
      // Path routing derives from the schema's entity-type folders/prefixes — without
      // this rebuild, create_entity of a type added via set_schema throws
      // "Unknown entity type" from the stale resolver (fixed v1.9.0 — load-bearing).
      engine.pathResolver = new PathResolver(engine.schema, resolverConfig);
      // These hold the SchemaRegistry/PathResolver by reference, so they are
      // rebuilt alongside it (mcp.ts constructs them per call — same effect).
      engine.allocator = new IDAllocator(engine.schema, engine.index);
      engine.relationshipGraph = new RelationshipGraph(engine.schema, engine.index);
      engine.canvasManager = new CanvasManager(engine.schema, engine.fs, engine.pathResolver);
      // Keep the index's reverse relationship map in sync with the active schema.
      engine.index.setReverseRelationMap(buildReverseRelationMap(s));
      engine.activeSchema = s;
    },

    /** Scan and populate the index. (Port of mcp.ts:235-291.) */
    async scanIndex(): Promise<void> {
      engine.index.clear();

      // Build list of folders to scan: archive + each entity type's folder from the
      // ACTIVE schema (custom types added via set_schema are scanned too).
      // Archive is scanned FIRST so that when a stale duplicate of an entity exists
      // in both a live type folder and archive/, the LIVE copy wins the id→path
      // mapping (index.set is last-writer-wins per id).
      const folders: string[] = [entry.archiveFolder];
      for (const typeDef of engine.schema.getAllEntityTypes()) {
        const folder = engine.pathResolver.getTypeFolderPath(typeDef.type);
        if (!folders.includes(folder)) folders.push(folder);
      }

      // Scan all folders. Type folders are flat; archive/ nests by type/quarter,
      // so it is walked recursively — otherwise archived entities in subfolders
      // are invisible to the index and unreachable by id (BUG 3).
      for (const folder of folders) {
        try {
          const files = folder === entry.archiveFolder
            ? await listFilesRecursive(engine.fs, folder)
            : await listFilesFlat(engine.fs, folder);
          for (const filePath of files) {
            if (!filePath.endsWith('.md')) continue;
            try {
              const content = await engine.fs.readFile(filePath);
              const entity = engine.parser.parse(content, filePath);

              // Get file stats for mtime
              const stat = await engine.fs.stat(filePath);
              const metadata = buildMetadata(entity, filePath, stat.mtimeMs);

              engine.index.set(metadata);

              // Index relationships
              if (entity.relationships) {
                for (const [relType, targets] of Object.entries(entity.relationships)) {
                  const targetIds = Array.isArray(targets) ? targets : [targets];
                  for (const targetId of targetIds) {
                    engine.index.addRelationship(entity.id, relType, targetId);
                  }
                }
              }
            } catch (err) {
              // Skip unparseable files
              if (process.env.DEBUG) {
                console.error(`Failed to parse ${filePath}:`, err);
              }
            }
          }
        } catch (err) {
          // Folder doesn't exist, skip
          if (process.env.DEBUG) {
            console.error(`Folder not found: ${folder}`, err);
          }
        }
      }
    },

    async msrl(): Promise<MsrlEngine> {
      if (!msrlPromise) {
        msrlPromise = overrides?.msrlFactory
          ? overrides.msrlFactory(entry)
          : (async () => {
              console.error(`Initializing MSRL engine for vault '${entry.id}'...`);
              // DYNAMIC import: native deps (onnxruntime/faiss) must not load
              // at module-eval time (vitest, plugin bundle).
              const { MsrlEngine: Msrl } = await import('@ostanlabs/md-retriever');
              const created = await Msrl.create({
                vaultRoot: entry.path,
                logLevel: 'info',
              });
              console.error(`MSRL engine initialized for vault '${entry.id}'`);
              return created;
            })();
      }
      return msrlPromise;
    },
  };

  engine.applySchema(loaded.schema);
  return engine;
}

// =============================================================================
// archiveEntity — copy → verify → delete original (spec D5/§9.2, work item W3)
// =============================================================================

/**
 * Archive one entity: serialize a copy with `archived: true` (original markdown
 * body preserved) to the archive/<type-folder>/ target, READ IT BACK to verify,
 * and only then delete the original and update the index (archived flag + new
 * path). Throws — leaving the source fully intact — if the target already
 * exists (never overwrite) or the written copy fails verification.
 *
 * The archive target derives from the PARSED entity's `type`, not from the id
 * prefix (pathResolver.getArchivePath → getTypeFromId throws "Cannot determine
 * type from id" on legacy/custom-prefixed ids like SC-9 that real vaults
 * contain — the frontmatter type is the authority, matching the pre-W8
 * cleanup_completed path construction).
 *
 * Replaces cleanup_completed's buggy archive (copy written, original never
 * deleted, false comment — mcp.ts:2246) at the W8 integration wave.
 */
export async function archiveEntity(
  eng: VaultEngine,
  id: EntityId
): Promise<{ from: string; to: string }> {
  const sourcePath = eng.index.getPathById(id);
  if (!sourcePath) {
    throw new Error(`Entity not found: ${id}`);
  }

  // Archiving re-serializes the entity, so load the full parsed form — and keep
  // the raw markdown body (BUG A: frontmatter-only writes destroyed it).
  const raw = await eng.fs.readFile(sourcePath);
  const entity = eng.parser.parse(raw, sourcePath);
  const body = extractBody(raw);

  const typeDef = eng.schema.getEntityType(entity.type);
  if (!typeDef) {
    throw new Error(
      `Entity ${id} has type '${entity.type}', which is not in this vault's schema — cannot resolve its archive folder.`
    );
  }
  const archiveTypeFolder = eng.entry.archiveFolder
    ? `${eng.entry.archiveFolder}/${typeDef.folder}`
    : typeDef.folder;
  const targetPath = `${archiveTypeFolder}/${eng.pathResolver.generateFilename(entity.id, entity.title)}`;
  if (targetPath === sourcePath) {
    throw new Error(`Entity ${id} is already at its archive path: ${sourcePath}`);
  }
  if (await eng.fs.exists(targetPath)) {
    throw new Error(
      `Archive target already exists: ${targetPath} — refusing to overwrite; ${sourcePath} left intact.`
    );
  }

  // 1. COPY: write the archived form to the archive target.
  const archived: RuntimeEntity = { ...entity, archived: true };
  await eng.fs.writeFile(targetPath, eng.serializer.serialize(archived) + body);

  // 2. VERIFY: read the target back and parse it. Only a verified copy may
  //    authorize deleting the original.
  let verifyError = '';
  try {
    const written = await eng.fs.readFile(targetPath);
    const parsed = eng.parser.parse(written, targetPath);
    if (parsed.id !== id) verifyError = `archived copy has id ${parsed.id}, expected ${id}`;
    else if (!parsed.archived) verifyError = 'archived copy does not carry archived: true';
  } catch (e) {
    verifyError = e instanceof Error ? e.message : String(e);
  }
  if (verifyError) {
    throw new Error(
      `Archive verification failed for ${id} at ${targetPath} (${verifyError}) — original ${sourcePath} left intact.`
    );
  }

  // 3. DELETE the original, then update the index entry (flag + path).
  await eng.fs.deleteFile(sourcePath);
  const stat = await eng.fs.stat(targetPath);
  const existing = eng.index.get(id);
  eng.index.removePathMapping(sourcePath);
  eng.index.set({
    ...(existing ?? buildMetadata(archived, targetPath, stat.mtimeMs)),
    archived: true,
    vault_path: targetPath,
    file_mtime: stat.mtimeMs,
  });

  return { from: sourcePath, to: targetPath };
}

// =============================================================================
// Parameterized bootstrap helpers (ports of mcp.ts:2953 / mcp.ts:3026 — the
// module-level originals close over `adapter`/VAULT_PATH and remain in mcp.ts
// until the W8 integration wave swaps its call sites to these)
// =============================================================================

// Valid empty canvas JSON (2-space indent + trailing newline) — what the
// bootstrap/repair writes so the plugin's "populate from vault" has a real file.
const EMPTY_CANVAS_JSON = JSON.stringify({ nodes: [], edges: [] }, null, 2) + '\n';

/**
 * Ensure the schema's `settings.defaultCanvas` (fallback:
 * 'projects/Project.canvas') exists in the vault behind `fs` and holds valid
 * canvas JSON:
 *   - missing               → create parent folder + write the empty canvas
 *   - empty/whitespace-only → repair by rewriting the empty canvas
 *   - has content           → leave untouched
 * Never throws — canvas bootstrap must not block the server (mirrors the
 * schema bootstrap's stderr logging).
 */
export async function ensureDefaultCanvas(fs: FileSystem, schema: Schema): Promise<void> {
  const canvasPath = schema.settings?.defaultCanvas || 'projects/Project.canvas';
  try {
    if (await fs.exists(canvasPath)) {
      const content = await fs.readFile(canvasPath);
      if (content.trim() !== '') return; // real content — leave untouched
      await fs.writeFile(canvasPath, EMPTY_CANVAS_JSON);
      console.error(`Repaired empty canvas ${canvasPath} (rewrote valid empty canvas JSON).`);
      return;
    }
    const parentDir = canvasPath.includes('/') ? canvasPath.slice(0, canvasPath.lastIndexOf('/')) : '';
    if (parentDir) {
      await fs.createDir(parentDir, { recursive: true });
    }
    await fs.writeFile(canvasPath, EMPTY_CANVAS_JSON);
    console.error(`Bootstrapped ${canvasPath} (empty canvas).`);
  } catch (e) {
    console.error(`WARNING: could not ensure default canvas ${canvasPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** '1.8.99' vs '1.9.0' → negative/zero/positive (numeric per-segment compare). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Install (or upgrade) the bundled Obsidian plugin into the vault behind `fs`:
 *   - not installed            → copy manifest.json/main.js/styles.css into
 *                                .obsidian/plugins/<id>/ and register the id in
 *                                .obsidian/community-plugins.json
 *   - installed, older version → overwrite the artifacts (upgrade); the user's
 *                                data.json settings are never touched
 *   - installed, same or newer → leave untouched
 * Never throws — like the schema/canvas bootstrap, this must not block the server.
 *
 * PARAMETERIZATION NOTE (W4 → W8): the artifact SOURCE is host-process state,
 * not vault state — mcp.ts locates it relative to its own bundle
 * (`findPluginSourceDir`, mcp.ts:2994, via import.meta.url), which would resolve
 * wrongly from this module's location. So the caller passes `artifactsDir`
 * (an absolute host path holding manifest.json/main.js[/styles.css]); the W8
 * integration wave keeps findPluginSourceDir in mcp.ts and feeds its result here.
 * Reads from the artifacts dir use node:fs (dynamic import — host paths are
 * outside the vault-rooted `fs` adapter).
 */
/**
 * Obsidian's config folder is user-configurable (Vault#configDir), but this
 * server runs OUTSIDE Obsidian and cannot query the API — vaults with a
 * renamed config folder must set OBSIDIAN_CONFIG_DIR to match (v1.9.2 fix;
 * also what keeps the obsidianmd/hardcoded-config-path release lint green).
 */
function obsidianConfigDir(): string {
  // eslint-disable-next-line obsidianmd/hardcoded-config-path
  return process.env.OBSIDIAN_CONFIG_DIR || '.obsidian';
}

export async function ensurePluginInstalled(fs: FileSystem, artifactsDir: string): Promise<void> {
  try {
    const { join } = await import('node:path');
    const { readFile: nodeReadFile } = await import('node:fs/promises');

    const manifestRaw = await nodeReadFile(join(artifactsDir, 'manifest.json'), 'utf8').catch(() => null);
    if (manifestRaw === null) {
      console.error(`WARNING: plugin artifacts (manifest.json) not found in ${artifactsDir} — skipping plugin install.`);
      return;
    }
    const manifest = JSON.parse(manifestRaw) as { id?: string; version?: string };
    if (!manifest.id || !manifest.version) {
      console.error('WARNING: bundled manifest.json has no id/version — skipping plugin install.');
      return;
    }

    // fs is rooted at the vault → vault-relative paths.
    const pluginDir = `${obsidianConfigDir()}/plugins/${manifest.id}`;
    const installedManifestPath = `${pluginDir}/manifest.json`;
    if (await fs.exists(installedManifestPath)) {
      try {
        const installed = JSON.parse(await fs.readFile(installedManifestPath)) as { version?: string };
        if (installed.version && compareVersions(installed.version, manifest.version) >= 0) {
          return; // same or newer already installed — leave untouched
        }
      } catch { /* unreadable installed manifest → reinstall */ }
    }

    await fs.createDir(pluginDir, { recursive: true });
    await fs.writeFile(installedManifestPath, manifestRaw);
    await fs.writeFile(`${pluginDir}/main.js`, await nodeReadFile(join(artifactsDir, 'main.js'), 'utf8'));
    try {
      await fs.writeFile(`${pluginDir}/styles.css`, await nodeReadFile(join(artifactsDir, 'styles.css'), 'utf8'));
    } catch { /* styles.css is optional */ }

    // Register in community-plugins.json so Obsidian enables it on next load.
    await enableCommunityPlugins(fs, [manifest.id]);
    console.error(`Installed plugin ${manifest.id} v${manifest.version} into ${pluginDir} (and enabled it in community-plugins.json).`);
  } catch (e) {
    console.error(`WARNING: could not install the bundled plugin: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Merge plugin ids into `.obsidian/community-plugins.json` (Obsidian's
 * enabled-plugins list), preserving whatever else is already enabled.
 * Malformed existing content is rewritten with just the requested ids.
 */
export async function enableCommunityPlugins(fs: FileSystem, ids: string[]): Promise<void> {
  const communityPath = `${obsidianConfigDir()}/community-plugins.json`;
  let enabled: string[] = [];
  if (await fs.exists(communityPath)) {
    try {
      const parsed = JSON.parse(await fs.readFile(communityPath));
      if (Array.isArray(parsed)) enabled = parsed;
    } catch { /* malformed → rewrite below */ }
  }
  let changed = false;
  for (const id of ids) {
    if (!enabled.includes(id)) {
      enabled.push(id);
      changed = true;
    }
  }
  if (changed) {
    await fs.writeFile(communityPath, JSON.stringify(enabled, null, 2) + '\n');
  }
}

/** Downloads one release asset; returns null on any failure (offline etc.). */
export type AssetFetcher = (url: string) => Promise<string | null>;

const DATAVIEW_RELEASE_BASE =
  'https://github.com/blacksmithgu/obsidian-dataview/releases/latest/download';

async function defaultAssetFetcher(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Install the Dataview community plugin (a runtime dependency of the
 * canvas-project-manager views) into `.obsidian/plugins/dataview/` and enable
 * it. Assets come from the project's GitHub latest-release download URLs.
 *
 * Deliberately conservative:
 *  - already installed (any version) → untouched, no network (we never
 *    auto-upgrade a third-party plugin);
 *  - offline / download failure → WARN and skip; the vault stays usable and
 *    the user can install Dataview from Obsidian's plugin browser instead;
 *  - `MCP_SKIP_DATAVIEW=1` skips entirely (tests, air-gapped setups).
 */
export async function ensureDataviewInstalled(
  fs: FileSystem,
  fetcher: AssetFetcher = defaultAssetFetcher
): Promise<void> {
  if (process.env.MCP_SKIP_DATAVIEW === '1') return;
  try {
    const pluginDir = `${obsidianConfigDir()}/plugins/dataview`;
    if (await fs.exists(`${pluginDir}/manifest.json`)) {
      // Present in any version → only make sure it's enabled.
      await enableCommunityPlugins(fs, ['dataview']);
      return;
    }

    const [manifestRaw, mainJs, stylesCss] = await Promise.all([
      fetcher(`${DATAVIEW_RELEASE_BASE}/manifest.json`),
      fetcher(`${DATAVIEW_RELEASE_BASE}/main.js`),
      fetcher(`${DATAVIEW_RELEASE_BASE}/styles.css`),
    ]);
    if (!manifestRaw || !mainJs) {
      console.error(
        'WARNING: could not download the Dataview plugin (offline or GitHub unreachable) — skipped. ' +
          'Install it from Obsidian\'s community-plugin browser instead.'
      );
      return;
    }
    let version = 'unknown';
    try {
      const m = JSON.parse(manifestRaw) as { id?: string; version?: string };
      if (m.id !== 'dataview') {
        console.error(`WARNING: downloaded Dataview manifest has unexpected id '${m.id}' — skipped.`);
        return;
      }
      version = m.version ?? version;
    } catch {
      console.error('WARNING: downloaded Dataview manifest is not valid JSON — skipped.');
      return;
    }

    await fs.createDir(pluginDir, { recursive: true });
    await fs.writeFile(`${pluginDir}/manifest.json`, manifestRaw);
    await fs.writeFile(`${pluginDir}/main.js`, mainJs);
    if (stylesCss) await fs.writeFile(`${pluginDir}/styles.css`, stylesCss);
    await enableCommunityPlugins(fs, ['dataview']);
    console.error(`Installed Dataview v${version} into ${pluginDir} (and enabled it).`);
  } catch (e) {
    console.error(`WARNING: could not install Dataview: ${e instanceof Error ? e.message : String(e)}`);
  }
}
