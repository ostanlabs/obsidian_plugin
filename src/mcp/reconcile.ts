/**
 * src/mcp/reconcile.ts — transactional schema-change reconciler (spec §9.2,
 * work item W10; design doc §10.2 data-loss blockers).
 *
 * `reconcileVault(eng, oldSchema, newSchema, opts)` diffs the two schemas,
 * plans the folder/entity consequences (archive removed types, move renamed
 * folders, report dangling refs) and either returns the plan (`dryRun`) or
 * applies it transactionally.
 *
 * TRANSACTIONAL ORDERING INVARIANTS (§0.1-#4: never move-then-delete):
 *   1. COPY  — every archive/move source is COPIED to its target first.
 *              No source is deleted in this phase, ever.
 *   2. VERIFY— every written target is read back, parsed, and id-checked.
 *   3. JOURNAL — only after full verification is the commit journal
 *              (.mcp-reconcile-journal.json) written. This is the point of no
 *              return: everything after it is idempotent roll-FORWARD.
 *   4. DELETE — sources are deleted, emptied folders removed, tombstones
 *              appended, schema.json written, engine hot-swapped + rescanned,
 *              added relationships backfilled, and the journal deleted last
 *              (success marker).
 *   - Failure BEFORE 3: partial target copies are deleted, every source is
 *     intact, the error propagates — the vault is byte-for-byte unchanged.
 *   - Failure AFTER 3: the journal survives; the next reconcileVault call on
 *     the vault detects it and completes the recorded work idempotently
 *     (re-verifies targets, finishes deletes, skips already-done steps).
 *
 * Removed-type paths are resolved via an OLD-schema-bound PathResolver: the
 * engine's post-change resolver THROWS on removed types
 * (path-resolver.ts:90/:115), so the old schema is the only source of truth
 * for where those entities live and where their archive copies belong.
 *
 * The whole apply runs under an exclusive `<vault>/.mcp.lock` (stale takeover
 * ~5s, mirroring the registry's config lock). Dry-run is strictly read-only —
 * it takes no lock and writes nothing (including no lock file), so a dry-run
 * leaves the vault byte-for-byte untouched.
 */

import { SchemaRegistry } from '../entity-core/schema-registry.js';
import { PathResolver, type PathResolverConfig } from '../entity-core/path-resolver.js';
import { EntityParser } from '../entity-core/parser.js';
import { EntitySerializer } from '../entity-core/serializer.js';
import { IDAllocator } from '../entity-core/id-allocator.js';
import {
  loadSchemaOrDefault,
  serializeSchema,
  SCHEMA_FILENAME,
} from '../entity-core/schema-bootstrap.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ReconcileCollision } from './types.js';
import type {
  VaultEngine,
  VaultEntry,
  ReconcilePlan,
  ReconcileResult,
  ArchivePlanItem,
  FileMovePlanItem,
  DanglingRefItem,
} from './types.js';
import type { Schema, FileSystem, EntityId, EntityType } from '../entity-core/types.js';

// =============================================================================
// Filenames + lock tuning
// =============================================================================

/** Exclusive whole-vault reconcile lock (vault-relative). */
export const RECONCILE_LOCK_FILENAME = '.mcp.lock';
/** Commit journal — present iff an apply passed verification but has not
 * finished; a re-run rolls it forward. */
export const RECONCILE_JOURNAL_FILENAME = '.mcp-reconcile-journal.json';
/** Tombstone index of removed-type entities (validation/reconcile can still
 * resolve archived ids of types the active schema no longer knows). */
export const TOMBSTONES_FILENAME = '.mcp-tombstones.json';

/** A lock older than this is presumed abandoned and taken over (mirrors
 * vault-registry's config lock). */
const STALE_LOCK_MS = 5_000;
const LOCK_RETRY_MS = 25;
const LOCK_ACQUIRE_TIMEOUT_MS = 15_000;

// =============================================================================
// Public shapes (beyond the §4.2 contract in ./types.ts)
// =============================================================================

export interface ReconcileOptions {
  dryRun?: boolean;
  /** 'refuse' (default): colliding targets abort the apply (ReconcileCollision).
   * 'suffix': colliding archive targets get a `_dup-N` filename instead. */
  collisionPolicy?: 'refuse' | 'suffix';
}

export interface FolderRename {
  type: EntityType;
  fromFolder: string;
  toFolder: string;
}

export interface SchemaDiff {
  typesAdded: EntityType[];
  typesRemoved: EntityType[];
  foldersRenamed: FolderRename[];
  relsAdded: string[];
  relsRemoved: string[];
}

/** The §4.2 ReconcilePlan plus diff detail + the removed-relationship orphan
 * report (fields left inert on SURVIVORS — reported, never stripped). */
export interface ExtendedReconcilePlan extends ReconcilePlan {
  foldersRenamed: FolderRename[];
  /** field name → number of surviving entities still carrying it (non-empty). */
  orphanedRelFields: Record<string, number>;
}

export interface TombstoneEntry {
  id: EntityId;
  type: EntityType;
  title: string;
  archivedTo: string;
  schemaVersionAtRemoval: string | number;
  ts: string;
}

/** One committed copy (archive or folder-rename move) recorded in the journal. */
interface JournalCopy {
  kind: 'archive' | 'move';
  /** Entity id when known — roll-forward re-verifies the target against it. */
  id?: EntityId;
  sourcePath: string;
  targetPath: string;
}

/** The commit journal — everything needed to finish the apply idempotently. */
interface ReconcileJournal {
  version: 1;
  ts: string;
  vault: string;
  copies: JournalCopy[];
  tombstones: TombstoneEntry[];
  foldersToCreate: string[];
  /** Old active folders of removed/renamed types — removed iff empty. */
  foldersToRemoveIfEmpty: string[];
  /** The new schema WITH its bumped schemaVersion, written to schema.json. */
  newSchema: Schema;
  /** Added relationships to inverse-backfill after the schema swap. */
  relsAdded: string[];
}

// =============================================================================
// Small helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function basename(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx < 0 ? p : p.slice(idx + 1);
}

function parentDirOf(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx <= 0 ? '' : p.slice(0, idx);
}

async function ensureParentDir(fs: FileSystem, filePath: string): Promise<void> {
  const dir = parentDirOf(filePath);
  if (dir && !(await fs.exists(dir))) {
    await fs.createDir(dir, { recursive: true });
  }
}

/** `a/b.md` + N → `a/b_dup-N.md` (suffix collision policy). */
function withDupSuffix(target: string, n: number): string {
  return target.endsWith('.md')
    ? `${target.slice(0, -3)}_dup-${n}.md`
    : `${target}_dup-${n}`;
}

/** Everything after the frontmatter block (leading newline preserved verbatim) —
 * same semantics as vault-engine's archiveEntity (BUG A: bodies must survive). */
function extractBody(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : '';
}

/** Lenient frontmatter parse (yaml only, no schema) — null when absent/invalid.
 * Used for verification so roll-forward works whichever schema is active. */
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const fm = parseYaml(match[1]);
    return fm && typeof fm === 'object' ? (fm as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function resolverConfig(entry: VaultEntry): PathResolverConfig {
  return {
    vaultPath: entry.path,
    entitiesFolder: entry.entitiesFolder,
    archiveFolder: entry.archiveFolder,
    canvasFolder: entry.canvasFolder,
  };
}

/** Every relationship FIELD name (forward + reverse) declared by a schema. */
function relationshipFieldNames(schema: Schema): string[] {
  const fields = new Set<string>();
  for (const rel of schema.relationships) {
    for (const pair of rel.pairs) {
      fields.add(pair.forward);
      fields.add(pair.reverse);
    }
  }
  return [...fields];
}

/** Schema content identity ignoring schemaVersion (idempotent re-runs must not
 * re-bump). Key-order sensitive, which is stable for our own serializeSchema
 * round-trips — hand-reordered-but-equal files just cost one extra bump. */
function schemaContentKey(s: Schema): string {
  return JSON.stringify({ ...s, schemaVersion: 0 });
}

// =============================================================================
// Vault lock — exclusive-create emulation over the FileSystem seam
// =============================================================================

/**
 * Acquire `<vault>/.mcp.lock`. The FileSystem interface has no exclusive-create
 * flag, so this emulates it: write a unique token, read it back, and only the
 * writer whose token survived holds the lock. Locks older than ~5s are presumed
 * abandoned (holder crashed) and taken over, like the registry's config lock.
 */
async function acquireVaultLock(fs: FileSystem): Promise<void> {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  for (;;) {
    if (!(await fs.exists(RECONCILE_LOCK_FILENAME))) {
      await fs.writeFile(RECONCILE_LOCK_FILENAME, token);
      const readBack = await fs.readFile(RECONCILE_LOCK_FILENAME).catch(() => null);
      if (readBack === token) return;
    } else {
      try {
        const st = await fs.stat(RECONCILE_LOCK_FILENAME);
        if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
          // Holder presumed dead — remove and re-race for the freed lock.
          await fs.deleteFile(RECONCILE_LOCK_FILENAME).catch(() => undefined);
          continue;
        }
      } catch {
        continue; // lock vanished between exists() and stat() — re-race
      }
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out acquiring ${RECONCILE_LOCK_FILENAME} after ${LOCK_ACQUIRE_TIMEOUT_MS}ms. ` +
          `If no other reconcile is running, delete the lockfile.`
      );
    }
    await sleep(LOCK_RETRY_MS + Math.floor(Math.random() * LOCK_RETRY_MS));
  }
}

async function releaseVaultLock(fs: FileSystem): Promise<void> {
  await fs.deleteFile(RECONCILE_LOCK_FILENAME).catch(() => undefined);
}

// =============================================================================
// Tombstones
// =============================================================================

/** Read the per-vault tombstone index; [] when absent or unreadable. */
export async function readTombstones(fs: FileSystem): Promise<TombstoneEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(TOMBSTONES_FILENAME);
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TombstoneEntry[]) : [];
  } catch {
    return [];
  }
}

// =============================================================================
// diffSchemas
// =============================================================================

/**
 * True when the diff has folder-level consequences that need the reconciler:
 * types added/removed, type folders renamed, relationships added/removed.
 * Non-structural edits (descriptions, fields, statuses, settings, positioning)
 * can be applied by writing schema.json directly — no files move.
 */
export function hasStructuralChanges(diff: SchemaDiff): boolean {
  return (
    diff.typesAdded.length > 0 ||
    diff.typesRemoved.length > 0 ||
    diff.foldersRenamed.length > 0 ||
    diff.relsAdded.length > 0 ||
    diff.relsRemoved.length > 0
  );
}

/**
 * The schemaVersion bump rule, shared by the reconciler's plan and set_schema's
 * non-structural fast path (the two write paths must agree — spec §9.1):
 * `from` is the vault's on-disk schema.json version when present (the file is
 * the source of truth), else the in-memory old schema's. Integer bump; content
 * identical to the on-disk file (ignoring schemaVersion — e.g. an idempotent
 * re-save or a roll-forward re-run) keeps the version instead of re-bumping.
 */
export async function computeSchemaVersionBump(
  fs: FileSystem,
  oldSchema: Schema,
  newSchema: Schema
): Promise<{ from: number; to: number }> {
  const loaded = await loadSchemaOrDefault(fs, '');
  const current = loaded.source === 'file' ? loaded.schema : oldSchema;
  const fromRaw = current.schemaVersion;
  const from = typeof fromRaw === 'number' && Number.isFinite(fromRaw) ? Math.floor(fromRaw) : 0;
  const unchanged =
    loaded.source === 'file' && schemaContentKey(current) === schemaContentKey(newSchema);
  return { from, to: unchanged ? from : from + 1 };
}

export function diffSchemas(oldSchema: Schema, newSchema: Schema): SchemaDiff {
  const oldTypes = new Map(oldSchema.entityTypes.map((t) => [t.type, t]));
  const newTypes = new Map(newSchema.entityTypes.map((t) => [t.type, t]));
  const typesAdded = [...newTypes.keys()].filter((t) => !oldTypes.has(t));
  const typesRemoved = [...oldTypes.keys()].filter((t) => !newTypes.has(t));
  const foldersRenamed: FolderRename[] = [];
  for (const [type, oldDef] of oldTypes) {
    const newDef = newTypes.get(type);
    if (newDef && newDef.folder !== oldDef.folder) {
      foldersRenamed.push({ type, fromFolder: oldDef.folder, toFolder: newDef.folder });
    }
  }
  const oldRels = new Set(oldSchema.relationships.map((r) => r.name));
  const newRels = new Set(newSchema.relationships.map((r) => r.name));
  const relsAdded = [...newRels].filter((r) => !oldRels.has(r));
  const relsRemoved = [...oldRels].filter((r) => !newRels.has(r));
  return { typesAdded, typesRemoved, foldersRenamed, relsAdded, relsRemoved };
}

// =============================================================================
// buildReconcilePlan — strictly read-only
// =============================================================================

export async function buildReconcilePlan(
  eng: VaultEngine,
  oldSchema: Schema,
  newSchema: Schema,
  opts: ReconcileOptions = {}
): Promise<ExtendedReconcilePlan> {
  const fs = eng.fs;
  const policy = opts.collisionPolicy ?? 'refuse';
  const diff = diffSchemas(oldSchema, newSchema);
  const cfg = resolverConfig(eng.entry);
  // OLD-schema-bound resolver: the only resolver that can route removed types
  // (the engine's post-change resolver throws "Unknown entity type" on them).
  const oldResolver = new PathResolver(new SchemaRegistry(oldSchema), cfg);
  const newResolver = new PathResolver(new SchemaRegistry(newSchema), cfg);

  // --- entitiesToArchive: every ACTIVE entity of each removed type ------------
  const entitiesToArchive: ArchivePlanItem[] = [];
  const removedIds = new Set<EntityId>();
  for (const type of diff.typesRemoved) {
    // Derive archive/<old-type-folder> from the removed type's OLD definition
    // directly — NOT via getArchiveFolderPath(id), which infers type from the
    // id PREFIX and throws "Cannot determine type from id" on legacy/custom
    // prefixed ids (e.g. SC-9, present in the production vault). We already
    // know the type: we are enumerating its entities.
    const oldDef = oldSchema.entityTypes.find((t) => t.type === type);
    if (!oldDef) continue; // unreachable: typesRemoved comes from oldSchema
    const archiveDir = eng.entry.archiveFolder
      ? `${eng.entry.archiveFolder}/${oldDef.folder}`
      : oldDef.folder;
    for (const meta of eng.index.getByType(type)) {
      if (meta.archived) continue;
      // Target keeps the actual on-disk filename (archival never renames), only
      // the folder comes from the old type definition: archive/<old-type-folder>/.
      entitiesToArchive.push({
        id: meta.id,
        type,
        sourcePath: meta.vault_path,
        targetPath: `${archiveDir}/${basename(meta.vault_path)}`,
      });
      removedIds.add(meta.id);
    }
  }

  // --- fileMoves for folder renames -------------------------------------------
  const fileMoves: FileMovePlanItem[] = [];
  for (const rename of diff.foldersRenamed) {
    const toFolder = newResolver.getTypeFolderPath(rename.type);
    if (
      toFolder === eng.entry.archiveFolder ||
      (eng.entry.entitiesFolder && toFolder === eng.entry.entitiesFolder)
    ) {
      throw new Error(
        `Folder rename for type '${rename.type}' targets the reserved folder '${toFolder}' — refused.`
      );
    }
    if (await fs.exists(toFolder)) {
      throw new Error(
        `Folder rename for type '${rename.type}' targets '${toFolder}', which already exists — ` +
          `refused (merging into an existing folder is not supported).`
      );
    }
    // Active files only: archived copies stay put (the archive is scanned
    // recursively, so entities under the old archive folder name stay reachable).
    for (const meta of eng.index.getByType(rename.type)) {
      if (meta.archived) continue;
      fileMoves.push({
        sourcePath: meta.vault_path,
        targetPath: `${toFolder}/${basename(meta.vault_path)}`,
      });
    }
  }

  // --- collision scan: assert !exists for EVERY target ------------------------
  const collisions: string[] = [];
  const planned = new Set<string>();
  const taken = async (t: string): Promise<boolean> => planned.has(t) || fs.exists(t);
  for (const item of entitiesToArchive) {
    if (await taken(item.targetPath)) {
      if (policy === 'suffix') {
        let n = 1;
        let candidate = withDupSuffix(item.targetPath, n);
        while (await taken(candidate)) candidate = withDupSuffix(item.targetPath, ++n);
        item.renamedTo = candidate;
        planned.add(candidate);
      } else {
        collisions.push(item.targetPath);
      }
    } else {
      planned.add(item.targetPath);
    }
  }
  for (const mv of fileMoves) {
    // The whole target folder was asserted absent above, so a hit here can only
    // be an intra-batch duplicate — always a hard collision (no suffix on moves).
    if (await taken(mv.targetPath)) collisions.push(mv.targetPath);
    else planned.add(mv.targetPath);
  }

  // --- danglingRefs: SURVIVORS referencing soon-archived ids (report only) ----
  const danglingRefs: DanglingRefItem[] = [];
  if (removedIds.size > 0) {
    const seen = new Set<string>();
    for (const field of relationshipFieldNames(oldSchema)) {
      for (const [fromId, targets] of eng.index.buildAdjacency(field, 'forward')) {
        if (removedIds.has(fromId)) continue; // not a survivor
        for (const toId of targets) {
          if (!removedIds.has(toId)) continue;
          const key = `${fromId}|${field}|${toId}`;
          if (!seen.has(key)) {
            seen.add(key);
            danglingRefs.push({ fromId, relationship: field, toId });
          }
        }
      }
    }
  }

  // --- orphaned inert fields of removed relationships (count per field) -------
  // Reported, NEVER stripped (opt-in stripping is out of scope this wave).
  const orphanedRelFields: Record<string, number> = {};
  for (const relName of diff.relsRemoved) {
    const rel = oldSchema.relationships.find((r) => r.name === relName);
    for (const pair of rel?.pairs ?? []) {
      for (const field of [pair.forward, pair.reverse]) {
        for (const [fromId, targets] of eng.index.buildAdjacency(field, 'forward')) {
          if (removedIds.has(fromId) || targets.length === 0) continue;
          orphanedRelFields[field] = (orphanedRelFields[field] ?? 0) + 1;
        }
      }
    }
  }

  // --- foldersToCreate ---------------------------------------------------------
  const foldersToCreate: string[] = [];
  for (const type of diff.typesAdded) {
    const folder = newResolver.getTypeFolderPath(type);
    if (!(await fs.exists(folder)) && !foldersToCreate.includes(folder)) {
      foldersToCreate.push(folder);
    }
  }
  for (const rename of diff.foldersRenamed) {
    const folder = newResolver.getTypeFolderPath(rename.type);
    if (!foldersToCreate.includes(folder)) foldersToCreate.push(folder);
  }

  // --- schemaVersion from/to (shared bump rule — see computeSchemaVersionBump) --
  const { from, to } = await computeSchemaVersionBump(fs, oldSchema, newSchema);

  return {
    vault: eng.entry.id,
    typesAdded: diff.typesAdded,
    typesRemoved: diff.typesRemoved,
    foldersToCreate,
    entitiesToArchive,
    fileMoves,
    collisions,
    collisionPolicy: policy,
    danglingRefs,
    relsAdded: diff.relsAdded,
    relsRemoved: diff.relsRemoved,
    schemaVersionFrom: from,
    schemaVersionTo: to,
    foldersRenamed: diff.foldersRenamed,
    orphanedRelFields,
  };
}

// =============================================================================
// Roll-forward — everything after the journal commit, fully idempotent
// =============================================================================

/**
 * Complete a committed reconcile from its journal. Idempotent by construction:
 * every step either re-verifies before acting or skips already-done work, so a
 * crash anywhere in here is healed by running it again.
 */
async function completeFromJournal(
  eng: VaultEngine,
  journal: ReconcileJournal
): Promise<{ foldersCreated: string[]; foldersRemoved: string[] }> {
  const fs = eng.fs;

  // (1) Re-verify EVERY target before deleting ANY source. A missing/mismatched
  // target must halt the roll-forward (journal kept) — deleting its source
  // would be the §0.1-#4 data loss this module exists to prevent.
  for (const copy of journal.copies) {
    let failure = '';
    try {
      const raw = await fs.readFile(copy.targetPath);
      const fm = parseFrontmatter(raw);
      if (copy.id && fm?.id !== copy.id) {
        failure = `target holds id ${String(fm?.id)}, expected ${copy.id}`;
      }
    } catch {
      failure = 'target unreadable';
    }
    if (failure) {
      throw new Error(
        `Reconcile roll-forward halted: ${copy.targetPath} failed verification (${failure}). ` +
          `Journal kept; no sources were deleted.`
      );
    }
  }

  // (2) Delete sources (skip ones already gone — re-run after partial deletes).
  for (const copy of journal.copies) {
    if (copy.sourcePath !== copy.targetPath && (await fs.exists(copy.sourcePath))) {
      await fs.deleteFile(copy.sourcePath);
    }
  }

  // (3) Remove now-empty active folders of removed/renamed types.
  const foldersRemoved: string[] = [];
  for (const folder of journal.foldersToRemoveIfEmpty) {
    try {
      if ((await fs.exists(folder)) && (await fs.readDir(folder)).length === 0) {
        await fs.deleteDir(folder);
        foldersRemoved.push(folder);
      }
    } catch {
      // Folder removal is cosmetic — never fail the reconcile over it.
    }
  }

  // (4) Tombstones — append-once (id+archivedTo keyed) so re-runs don't duplicate.
  if (journal.tombstones.length > 0) {
    const existing = await readTombstones(fs);
    const have = new Set(existing.map((t) => `${t.id}|${t.archivedTo}`));
    const additions = journal.tombstones.filter((t) => !have.has(`${t.id}|${t.archivedTo}`));
    if (additions.length > 0) {
      await fs.writeFile(
        TOMBSTONES_FILENAME,
        JSON.stringify([...existing, ...additions], null, 2) + '\n'
      );
    }
  }

  // (5) Create new-type (and rename-target) folders.
  const foldersCreated: string[] = [];
  for (const folder of journal.foldersToCreate) {
    if (!(await fs.exists(folder))) {
      await fs.createDir(folder, { recursive: true });
      foldersCreated.push(folder);
    }
  }

  // (6) Write the bumped schema.json (idempotent bytes) and hot-swap the engine.
  await fs.writeFile(SCHEMA_FILENAME, serializeSchema(journal.newSchema));
  eng.applySchema(journal.newSchema);
  await eng.scanIndex();

  // (7) Added relationships: full inverse backfill + prune across the index
  // (idempotent desired-state rewrite — safe to repeat on roll-forward).
  if (journal.relsAdded.length > 0) {
    const changed = await backfillRelationships(eng, journal.relsAdded);
    if (changed) await eng.scanIndex();
  }

  // (8) Success marker: the journal goes last.
  await fs.deleteFile(RECONCILE_JOURNAL_FILENAME).catch(() => undefined);

  return { foldersCreated, foldersRemoved };
}

/**
 * For each named relationship (must exist in the engine's ACTIVE schema),
 * recompute every entity's REVERSE field from the forward fields across the
 * index (forward is the source of truth), adding missing inverses and pruning
 * stale ones. Only non-archived entities are touched; bodies are preserved.
 * Returns true when any file was rewritten.
 */
async function backfillRelationships(eng: VaultEngine, relNames: string[]): Promise<boolean> {
  let changed = false;
  for (const name of relNames) {
    const rel = eng.schema.getRelationship(name);
    if (!rel) continue;
    for (const pair of rel.pairs) {
      // Desired reverse sets, derived from the forward field's adjacency.
      const desired = new Map<EntityId, EntityId[]>();
      for (const [fromId, targets] of eng.index.buildAdjacency(pair.forward, 'forward')) {
        const fromMeta = eng.index.get(fromId);
        if (!fromMeta || fromMeta.archived) continue;
        if (pair.from !== '*' && fromMeta.type !== pair.from) continue;
        for (const toId of targets) {
          const toMeta = eng.index.get(toId);
          if (!toMeta || toMeta.archived) continue;
          if (pair.to !== '*' && toMeta.type !== pair.to) continue;
          const arr = desired.get(toId) ?? [];
          if (!arr.includes(fromId)) arr.push(fromId);
          desired.set(toId, arr);
        }
      }
      // Rewrite every candidate REVERSE-side entity whose field differs.
      const candidates =
        pair.to === '*' ? eng.index.getAll() : eng.index.getByType(pair.to);
      for (const meta of candidates) {
        if (meta.archived) continue;
        const want = [...(desired.get(meta.id) ?? [])].sort();
        const path = eng.index.getPathById(meta.id);
        if (!path) continue;
        const raw = await eng.fs.readFile(path);
        const match = raw.match(/^---\n([\s\S]*?)\n---/);
        if (!match) continue;
        let fm: Record<string, unknown>;
        try {
          fm = parseYaml(match[1]) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (!fm || typeof fm !== 'object') continue;
        const cur = fm[pair.reverse];
        const curArr = (cur === undefined || cur === null ? [] : Array.isArray(cur) ? cur : [cur])
          .map(String)
          .sort();
        if (curArr.length === want.length && curArr.every((v, i) => v === want[i])) continue;
        if (want.length === 0) delete fm[pair.reverse];
        else if (rel.cardinality.reverse === 'one' && want.length === 1) fm[pair.reverse] = want[0];
        else fm[pair.reverse] = want;
        const body = extractBody(raw);
        await eng.fs.writeFile(path, `---\n${stringifyYaml(fm).trimEnd()}\n---\n${body}`);
        changed = true;
      }
    }
  }
  return changed;
}

// =============================================================================
// reconcileVault — the entry point (spec §9.2)
// =============================================================================

export async function reconcileVault(
  eng: VaultEngine,
  oldSchema: Schema,
  newSchema: Schema,
  opts: ReconcileOptions = {}
): Promise<ReconcilePlan | ReconcileResult> {
  // Dry-run is strictly read-only: no lock, no duplicate repair, no writes of
  // any kind — the vault must come out byte-for-byte identical.
  if (opts.dryRun) {
    return buildReconcilePlan(eng, oldSchema, newSchema, opts);
  }

  const fs = eng.fs;
  await acquireVaultLock(fs);
  try {
    // Roll forward a previously committed-but-unfinished apply first — the
    // journal is the point of no return, so it must be completed, not redone.
    if (await fs.exists(RECONCILE_JOURNAL_FILENAME)) {
      const journal = JSON.parse(
        await fs.readFile(RECONCILE_JOURNAL_FILENAME)
      ) as ReconcileJournal;
      await completeFromJournal(eng, journal);
    }

    const oldRegistry = new SchemaRegistry(oldSchema);
    const oldResolver = new PathResolver(oldRegistry, resolverConfig(eng.entry));

    // Pre-flight: repair duplicate ids (inbound refs rewritten) so no id
    // collision survives into archival — two same-id files would otherwise
    // fight over one archive target.
    const repaired = await new IDAllocator(oldRegistry, eng.index).repairDuplicates(
      fs,
      oldResolver
    );
    if (repaired.length > 0) await eng.scanIndex();

    const plan = await buildReconcilePlan(eng, oldSchema, newSchema, opts);
    if (plan.collisions.length > 0 && plan.collisionPolicy === 'refuse') {
      // Nothing has been written — refuse loudly before the copy phase.
      throw new ReconcileCollision(plan.collisions);
    }

    const oldParser = new EntityParser(oldRegistry);
    const oldSerializer = new EntitySerializer(oldRegistry);

    // ---- Phase 1+2: COPY then VERIFY — no source is deleted in here ----------
    const written: string[] = [];
    const copies: JournalCopy[] = [];
    const tombstones: TombstoneEntry[] = [];
    try {
      for (const item of plan.entitiesToArchive) {
        const target = item.renamedTo ?? item.targetPath;
        const raw = await fs.readFile(item.sourcePath);
        const entity = oldParser.parse(raw, item.sourcePath);
        const body = extractBody(raw);
        await ensureParentDir(fs, target);
        await fs.writeFile(target, oldSerializer.serialize({ ...entity, archived: true }) + body);
        written.push(target);
        copies.push({ kind: 'archive', id: item.id, sourcePath: item.sourcePath, targetPath: target });
        tombstones.push({
          id: item.id,
          type: item.type,
          title: entity.title,
          archivedTo: target,
          schemaVersionAtRemoval: plan.schemaVersionFrom ?? 0,
          ts: new Date().toISOString(),
        });
      }
      for (const mv of plan.fileMoves) {
        const raw = await fs.readFile(mv.sourcePath);
        await ensureParentDir(fs, mv.targetPath);
        await fs.writeFile(mv.targetPath, raw);
        written.push(mv.targetPath);
        copies.push({
          kind: 'move',
          id: eng.index.getIdByPath(mv.sourcePath),
          sourcePath: mv.sourcePath,
          targetPath: mv.targetPath,
        });
      }
      // VERIFY every target: read back + parse + id match (+ archived flag).
      // Only a fully verified batch may authorize any deletion.
      for (const copy of copies) {
        const back = await fs.readFile(copy.targetPath); // throws if missing
        const parsed = oldParser.parse(back, copy.targetPath);
        if (copy.id && parsed.id !== copy.id) {
          throw new Error(
            `Verification failed: ${copy.targetPath} holds id ${parsed.id}, expected ${copy.id}.`
          );
        }
        if (copy.kind === 'archive' && !parsed.archived) {
          throw new Error(`Verification failed: ${copy.targetPath} lacks archived: true.`);
        }
      }
    } catch (err) {
      // Failure BEFORE the journal: delete the partial target copies; every
      // source is untouched (nothing was deleted yet). Then rethrow.
      for (const target of written) {
        await fs.deleteFile(target).catch(() => undefined);
      }
      throw err;
    }

    // ---- Phase 3: JOURNAL — the point of no return ----------------------------
    const bumped: Schema = { ...newSchema, schemaVersion: plan.schemaVersionTo as number };
    const journal: ReconcileJournal = {
      version: 1,
      ts: new Date().toISOString(),
      vault: eng.entry.id,
      copies,
      tombstones,
      foldersToCreate: plan.foldersToCreate,
      foldersToRemoveIfEmpty: [
        ...plan.typesRemoved.map((t) => oldResolver.getTypeFolderPath(t)),
        ...plan.foldersRenamed.map((r) => oldResolver.getTypeFolderPath(r.type)),
      ],
      newSchema: bumped,
      relsAdded: plan.relsAdded,
    };
    await fs.writeFile(RECONCILE_JOURNAL_FILENAME, JSON.stringify(journal, null, 2) + '\n');

    // ---- Phase 4: complete (idempotent roll-forward, deletes the journal) -----
    const { foldersCreated, foldersRemoved } = await completeFromJournal(eng, journal);

    return {
      plan,
      applied: true,
      archived: plan.entitiesToArchive.map((i) => i.id),
      moved: plan.fileMoves.map((m) => m.targetPath),
      foldersCreated,
      foldersRemoved,
      tombstoned: tombstones.map((t) => t.id),
    };
  } finally {
    await releaseVaultLock(fs);
  }
}
