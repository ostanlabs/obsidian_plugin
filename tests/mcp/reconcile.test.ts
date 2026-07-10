/**
 * W10 — transactional schema-change reconciler (MULTI_VAULT_MCP_IMPLEMENTATION_SPEC
 * §9.2/§0.1-3/§0.1-4, design doc §10.2). Runs entirely on the in-memory harness.
 *
 * The non-negotiables under test:
 *   - dry-run returns the full plan and writes NOTHING (byte-for-byte snapshot);
 *   - apply is copy-not-move: every target is written AND verified before any
 *     source is deleted; a crash mid-copy leaves every source intact;
 *   - a crash after the journal commit rolls FORWARD idempotently on re-run;
 *   - collisions never overwrite: 'refuse' (default) throws ReconcileCollision,
 *     'suffix' archives to _dup-N;
 *   - removed-type paths resolve via an OLD-schema-bound PathResolver (the
 *     engine's post-change resolver throws on removed types).
 */

import { describe, it, expect } from 'vitest';
import { InMemoryFileSystem } from '../entity-core/harness/in-memory-fs.js';
import { buildVaultEngine } from '../../src/mcp/vault-engine.js';
import {
  reconcileVault,
  diffSchemas,
  readTombstones,
  RECONCILE_LOCK_FILENAME,
  RECONCILE_JOURNAL_FILENAME,
  TOMBSTONES_FILENAME,
  type ExtendedReconcilePlan,
} from '../../src/mcp/reconcile.js';
import { ReconcileCollision } from '../../src/mcp/types.js';
import type { VaultEntry, ReconcileResult } from '../../src/mcp/types.js';
import { serializeSchema } from '../../src/entity-core/schema-bootstrap.js';
import type {
  Schema,
  FileSystem,
  FileEntry,
  FileStat,
  RelationshipDefinition,
} from '../../src/entity-core/types.js';

// ---------------------------------------------------------------------------
// Fixtures — AgentPlatform-shaped layout (type folders at the vault root)
// ---------------------------------------------------------------------------

const ENTRY: VaultEntry = {
  id: 'test-vault',
  name: 'Test Vault',
  path: '/vaults/test',
  entitiesFolder: '',
  archiveFolder: 'archive',
  archiveLayout: 'by-type',
  canvasFolder: 'projects',
};

function typeDef(type: string, idPrefix: string, folder: string) {
  return {
    type,
    label: type,
    idPrefix,
    folder,
    statuses: ['New', 'Done'],
    defaultStatus: 'New',
    fields: [],
    canvas: { width: 400, height: 300, color: '1' },
  };
}

const LINKAGE: RelationshipDefinition = {
  name: 'linkage',
  label: 'Linkage',
  pairs: [{ from: 'widget', to: 'gadget', forward: 'links_to', reverse: 'linked_from' }],
  cardinality: { forward: 'many', reverse: 'many' },
  canvas: { color: 'gray', style: 'solid' },
  graph: { transitiveReduction: false, cyclePrevention: false },
};

function makeSchema(o: {
  version?: number;
  types: ReturnType<typeof typeDef>[];
  rels?: RelationshipDefinition[];
}): Schema {
  return {
    schemaVersion: o.version ?? 1,
    settings: {
      idPadding: 3,
      archiveLayout: 'by-type',
      filenamePattern: '{id}_{title}',
      defaultCanvas: 'projects/Project.canvas',
    },
    entityTypes: o.types,
    relationships: o.rels ?? [],
    workstreams: {
      values: ['engineering'],
      default: 'engineering',
      normalization: {},
      canvas: { engineering: { color: '3' } },
    },
  } as Schema;
}

const WIDGET = typeDef('widget', 'W', 'widgets');
const GADGET = typeDef('gadget', 'G', 'gadgets');
const DOOHICKEY = typeDef('doohickey', 'D', 'doohickeys');

const SCHEMA_V1 = makeSchema({ types: [WIDGET, GADGET], rels: [LINKAGE] });
/** gadget (and its relationship) removed. */
const SCHEMA_NO_GADGET = makeSchema({ types: [WIDGET] });
/** gadget folder renamed gadgets → gizmos. */
const SCHEMA_RENAMED = makeSchema({
  types: [WIDGET, typeDef('gadget', 'G', 'gizmos')],
  rels: [LINKAGE],
});
const SCHEMA_WIDGET_ONLY = makeSchema({ types: [WIDGET] });
/** widget-only → +gadget +doohickey +linkage (type/rel ADDED scenario). */
const SCHEMA_ADDED = makeSchema({ types: [WIDGET, GADGET, DOOHICKEY], rels: [LINKAGE] });

/** Raw entity markdown (frontmatter + body), independent of the serializer. */
function entityMd(o: {
  id: string;
  type: string;
  title: string;
  archived?: boolean;
  extraFrontmatter?: string;
  body?: string;
}): string {
  const extra = o.extraFrontmatter ? `${o.extraFrontmatter}\n` : '';
  return `---
id: ${o.id}
type: ${o.type}
title: ${o.title}
status: New
workstream: engineering
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-02T00:00:00Z
archived: ${o.archived ?? false}
${extra}---

# ${o.title}

${o.body ?? `${o.title} body.`}
`;
}

/** Standard removal fixture: 1 surviving widget, 2 live gadgets, 1 pre-archived gadget. */
function removalVaultFiles(): Record<string, string> {
  return {
    'widgets/W-001_alpha.md': entityMd({
      id: 'W-001',
      type: 'widget',
      title: 'Alpha',
      extraFrontmatter: 'links_to:\n  - G-001\n  - G-002',
      body: 'Widget body survives.',
    }),
    'gadgets/G-001_beta.md': entityMd({
      id: 'G-001',
      type: 'gadget',
      title: 'Beta',
      extraFrontmatter: 'linked_from:\n  - W-001',
      body: 'Gadget one body.',
    }),
    'gadgets/G-002_gamma.md': entityMd({
      id: 'G-002',
      type: 'gadget',
      title: 'Gamma',
      extraFrontmatter: 'linked_from:\n  - W-001',
      body: 'Gadget two body.',
    }),
    'archive/gadgets/G-900_old.md': entityMd({
      id: 'G-900',
      type: 'gadget',
      title: 'Old',
      archived: true,
      body: 'Already archived.',
    }),
  };
}

function memFs(schema: Schema, files: Record<string, string>): InMemoryFileSystem {
  return new InMemoryFileSystem({ 'schema.json': serializeSchema(schema), ...files });
}

async function makeEngine(fs: FileSystem) {
  const engine = await buildVaultEngine(ENTRY, { fs });
  await engine.scanIndex();
  return engine;
}

/** FileSystem wrapper with injectable write/delete failures (crash simulation). */
class FailingFs implements FileSystem {
  constructor(
    private readonly inner: InMemoryFileSystem,
    private readonly hooks: {
      failWrite?: (path: string) => boolean;
      failDelete?: (path: string) => boolean;
    }
  ) {}
  readFile(p: string) { return this.inner.readFile(p); }
  async writeFile(p: string, c: string) {
    if (this.hooks.failWrite?.(p)) throw new Error(`EIO injected write failure: ${p}`);
    return this.inner.writeFile(p, c);
  }
  async deleteFile(p: string) {
    if (this.hooks.failDelete?.(p)) throw new Error(`EIO injected delete failure: ${p}`);
    return this.inner.deleteFile(p);
  }
  renameFile(a: string, b: string) { return this.inner.renameFile(a, b); }
  exists(p: string) { return this.inner.exists(p); }
  stat(p: string): Promise<FileStat> { return this.inner.stat(p); }
  readDir(p: string): Promise<FileEntry[]> { return this.inner.readDir(p); }
  createDir(p: string, o?: { recursive?: boolean }) { return this.inner.createDir(p, o); }
  deleteDir(p: string, o?: { recursive?: boolean }) { return this.inner.deleteDir(p, o); }
  readFiles(ps: string[]) { return this.inner.readFiles(ps); }
  writeFiles(fs: Map<string, string>) { return this.inner.writeFiles(fs); }
}

// ---------------------------------------------------------------------------
// diffSchemas
// ---------------------------------------------------------------------------

describe('diffSchemas', () => {
  it('computes typesAdded/typesRemoved/foldersRenamed/relsAdded/relsRemoved', () => {
    const diff = diffSchemas(SCHEMA_V1, SCHEMA_NO_GADGET);
    expect(diff.typesAdded).toEqual([]);
    expect(diff.typesRemoved).toEqual(['gadget']);
    expect(diff.foldersRenamed).toEqual([]);
    expect(diff.relsAdded).toEqual([]);
    expect(diff.relsRemoved).toEqual(['linkage']);

    const diff2 = diffSchemas(SCHEMA_WIDGET_ONLY, SCHEMA_ADDED);
    expect(diff2.typesAdded.sort()).toEqual(['doohickey', 'gadget']);
    expect(diff2.relsAdded).toEqual(['linkage']);

    const diff3 = diffSchemas(SCHEMA_V1, SCHEMA_RENAMED);
    expect(diff3.foldersRenamed).toEqual([
      { type: 'gadget', fromFolder: 'gadgets', toFolder: 'gizmos' },
    ]);
    expect(diff3.typesAdded).toEqual([]);
    expect(diff3.typesRemoved).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Dry-run
// ---------------------------------------------------------------------------

describe('reconcileVault — dry-run (type removal)', () => {
  async function dryRun() {
    const fs = memFs(SCHEMA_V1, removalVaultFiles());
    const engine = await makeEngine(fs);
    const before = fs.allFiles();
    const plan = (await reconcileVault(engine, SCHEMA_V1, SCHEMA_NO_GADGET, {
      dryRun: true,
    })) as ExtendedReconcilePlan;
    return { fs, engine, plan, before };
  }

  it('lists exactly the removed type\'s ACTIVE entities with archive targets under archive/<old-folder>/', async () => {
    const { plan } = await dryRun();
    expect(plan.typesRemoved).toEqual(['gadget']);
    expect(plan.entitiesToArchive.map((i) => i.id).sort()).toEqual(['G-001', 'G-002']);
    for (const item of plan.entitiesToArchive) {
      expect(item.targetPath.startsWith('archive/gadgets/')).toBe(true);
      expect(item.type).toBe('gadget');
    }
    const g1 = plan.entitiesToArchive.find((i) => i.id === 'G-001')!;
    expect(g1.sourcePath).toBe('gadgets/G-001_beta.md');
    expect(g1.targetPath).toBe('archive/gadgets/G-001_beta.md');
    // Pre-archived entities are NOT re-archived.
    expect(plan.entitiesToArchive.some((i) => i.id === 'G-900')).toBe(false);
  });

  it('reports dangling refs from survivors and orphaned inert fields per removed relationship', async () => {
    const { plan } = await dryRun();
    expect(
      plan.danglingRefs.map((d) => `${d.fromId}>${d.relationship}>${d.toId}`).sort()
    ).toEqual(['W-001>links_to>G-001', 'W-001>links_to>G-002']);
    expect(plan.relsRemoved).toEqual(['linkage']);
    // W-001 is the only SURVIVOR carrying a field of the removed relationship.
    expect(plan.orphanedRelFields).toEqual({ links_to: 1 });
  });

  it('writes NOTHING — the vault is byte-for-byte unchanged (no lock, no journal)', async () => {
    const { fs, before } = await dryRun();
    expect(fs.allFiles()).toEqual(before);
    expect(await fs.exists(RECONCILE_LOCK_FILENAME)).toBe(false);
    expect(await fs.exists(RECONCILE_JOURNAL_FILENAME)).toBe(false);
    expect(await fs.exists(TOMBSTONES_FILENAME)).toBe(false);
  });

  it('records schemaVersion from/to and defaults to the refuse collision policy', async () => {
    const { plan } = await dryRun();
    expect(plan.schemaVersionFrom).toBe(1);
    expect(plan.schemaVersionTo).toBe(2);
    expect(plan.collisionPolicy).toBe('refuse');
    expect(plan.vault).toBe('test-vault');
  });
});

// ---------------------------------------------------------------------------
// Apply — type removal
// ---------------------------------------------------------------------------

describe('reconcileVault — apply (type removal)', () => {
  it('archives removed-type entities with LEGACY ids whose prefix is not in the schema', async () => {
    // Production reality: ids like SC-9 predate the current prefix scheme.
    // getArchiveFolderPath(id) infers type from the id prefix and throws on
    // these — the plan must derive the folder from the removed type's OLD
    // definition instead (we know the type; we're enumerating its entities).
    const files = {
      ...removalVaultFiles(),
      'gadgets/SC-9_legacy.md': entityMd({ id: 'SC-9', type: 'gadget', title: 'Legacy' }),
    };
    const fs = memFs(SCHEMA_V1, files);
    const engine = await makeEngine(fs);
    const result = (await reconcileVault(engine, SCHEMA_V1, SCHEMA_NO_GADGET, {})) as ReconcileResult;
    expect(result.archived).toContain('SC-9');
    expect(await fs.exists('archive/gadgets/SC-9_legacy.md')).toBe(true);
    expect(await fs.exists('gadgets/SC-9_legacy.md')).toBe(false);
  });

  async function applyRemoval() {
    const fs = memFs(SCHEMA_V1, removalVaultFiles());
    // Explicit dir so the emptied-folder removal is observable on the harness fs.
    await fs.createDir('gadgets');
    const engine = await makeEngine(fs);
    const before = fs.allFiles();
    const result = (await reconcileVault(
      engine,
      SCHEMA_V1,
      SCHEMA_NO_GADGET,
      {}
    )) as ReconcileResult;
    return { fs, engine, result, before };
  }

  it('archives copies (verified), deletes sources, removes the emptied active folder', async () => {
    const { fs, result } = await applyRemoval();
    expect(result.applied).toBe(true);
    expect(result.archived.sort()).toEqual(['G-001', 'G-002']);

    for (const [source, target, body] of [
      ['gadgets/G-001_beta.md', 'archive/gadgets/G-001_beta.md', 'Gadget one body.'],
      ['gadgets/G-002_gamma.md', 'archive/gadgets/G-002_gamma.md', 'Gadget two body.'],
    ] as const) {
      const archived = await fs.readFile(target);
      expect(archived).toMatch(/^archived: true$/m);
      expect(archived).toContain(body); // markdown body preserved
      expect(await fs.exists(source)).toBe(false);
    }
    expect(await fs.exists('gadgets')).toBe(false);
    expect(result.foldersRemoved).toContain('gadgets');
  });

  it('tombstones the removed-type entities (readTombstones)', async () => {
    const { fs, result } = await applyRemoval();
    const tombs = await readTombstones(fs);
    expect(tombs.map((t) => t.id).sort()).toEqual(['G-001', 'G-002']);
    const g1 = tombs.find((t) => t.id === 'G-001')!;
    expect(g1.type).toBe('gadget');
    expect(g1.title).toBe('Beta');
    expect(g1.archivedTo).toBe('archive/gadgets/G-001_beta.md');
    expect(g1.schemaVersionAtRemoval).toBe(1);
    expect(typeof g1.ts).toBe('string');
    expect(result.tombstoned.sort()).toEqual(['G-001', 'G-002']);
  });

  it('writes the bumped schema.json, hot-swaps the engine, and clears journal + lock', async () => {
    const { fs, engine } = await applyRemoval();
    const written = JSON.parse(await fs.readFile('schema.json'));
    expect(written.schemaVersion).toBe(2);
    expect(written.entityTypes.map((t: { type: string }) => t.type)).toEqual(['widget']);
    expect(engine.activeSchema.schemaVersion).toBe(2);
    expect(engine.schema.getEntityType('gadget')).toBeNull();
    expect(await fs.exists(RECONCILE_JOURNAL_FILENAME)).toBe(false);
    expect(await fs.exists(RECONCILE_LOCK_FILENAME)).toBe(false);
  });

  it('resolved removed-type paths via the OLD-schema resolver (the engine\'s now throws)', async () => {
    const { engine, result } = await applyRemoval();
    // Post-applySchema the engine's own resolver cannot resolve the removed type…
    expect(() => engine.pathResolver.getTypeFolderPath('gadget')).toThrow(
      /Unknown entity type/
    );
    // …yet the plan carried fully resolved old-schema paths.
    expect(result.plan.entitiesToArchive.every((i) =>
      i.targetPath.startsWith('archive/gadgets/')
    )).toBe(true);
  });

  it('leaves survivors and pre-archived files byte-for-byte untouched', async () => {
    const { fs, before } = await applyRemoval();
    expect(await fs.readFile('widgets/W-001_alpha.md')).toBe(
      before.get('widgets/W-001_alpha.md')
    );
    expect(await fs.readFile('archive/gadgets/G-900_old.md')).toBe(
      before.get('archive/gadgets/G-900_old.md')
    );
  });
});

// ---------------------------------------------------------------------------
// Collision policy
// ---------------------------------------------------------------------------

describe('reconcileVault — collisions', () => {
  function collidingFiles(): Record<string, string> {
    const files = removalVaultFiles();
    // A DIFFERENT entity already occupies G-001's archive target path — a pure
    // filename collision (same-id duplicates are repairDuplicates' job instead).
    files['archive/gadgets/G-001_beta.md'] = entityMd({
      id: 'G-777',
      type: 'gadget',
      title: 'Beta',
      archived: true,
      body: 'PRE-EXISTING ARCHIVE COPY',
    });
    return files;
  }

  it('dry-run marks the colliding target', async () => {
    const fs = memFs(SCHEMA_V1, collidingFiles());
    const engine = await makeEngine(fs);
    const plan = (await reconcileVault(engine, SCHEMA_V1, SCHEMA_NO_GADGET, {
      dryRun: true,
    })) as ExtendedReconcilePlan;
    expect(plan.collisions).toEqual(['archive/gadgets/G-001_beta.md']);
  });

  it('default refuse: apply throws ReconcileCollision with NOTHING written or deleted', async () => {
    const fs = memFs(SCHEMA_V1, collidingFiles());
    const engine = await makeEngine(fs);
    const before = fs.allFiles();
    await expect(
      reconcileVault(engine, SCHEMA_V1, SCHEMA_NO_GADGET, {})
    ).rejects.toBeInstanceOf(ReconcileCollision);
    // Sources intact, pre-existing target not overwritten, no partial copies, no journal.
    expect(fs.allFiles()).toEqual(before);
  });

  it('suffix policy archives the collider to _dup-1 and records renamedTo', async () => {
    const fs = memFs(SCHEMA_V1, collidingFiles());
    const engine = await makeEngine(fs);
    const result = (await reconcileVault(engine, SCHEMA_V1, SCHEMA_NO_GADGET, {
      collisionPolicy: 'suffix',
    })) as ReconcileResult;

    const g1 = result.plan.entitiesToArchive.find((i) => i.id === 'G-001')!;
    expect(g1.renamedTo).toBe('archive/gadgets/G-001_beta_dup-1.md');
    expect(await fs.readFile('archive/gadgets/G-001_beta_dup-1.md')).toContain(
      'Gadget one body.'
    );
    // The occupant of the original target is untouched.
    expect(await fs.readFile('archive/gadgets/G-001_beta.md')).toContain(
      'PRE-EXISTING ARCHIVE COPY'
    );
    expect(await fs.exists('gadgets/G-001_beta.md')).toBe(false);
    const tombs = await readTombstones(fs);
    expect(tombs.find((t) => t.id === 'G-001')?.archivedTo).toBe(
      'archive/gadgets/G-001_beta_dup-1.md'
    );
  });
});

// ---------------------------------------------------------------------------
// Crash safety
// ---------------------------------------------------------------------------

describe('reconcileVault — crash safety', () => {
  it('crash BEFORE commit (K-th copy write fails): sources intact, partial copies cleaned, no journal', async () => {
    const inner = memFs(SCHEMA_V1, removalVaultFiles());
    let archiveWrites = 0;
    const fs = new FailingFs(inner, {
      failWrite: (p) => p.startsWith('archive/gadgets/') && ++archiveWrites === 2,
    });
    const engine = await makeEngine(fs);
    const before = inner.allFiles();

    await expect(
      reconcileVault(engine, SCHEMA_V1, SCHEMA_NO_GADGET, {})
    ).rejects.toThrow(/injected write failure/);

    // Byte-for-byte identical: sources intact, the first (partial) copy deleted,
    // no journal, no tombstones, schema.json untouched, lock released.
    expect(inner.allFiles()).toEqual(before);
  });

  it('crash AFTER journal (delete fails): journal survives; re-run rolls forward idempotently', async () => {
    const inner = memFs(SCHEMA_V1, removalVaultFiles());
    let failDeletes = true;
    const fs = new FailingFs(inner, {
      failDelete: (p) => failDeletes && p.startsWith('gadgets/'),
    });
    const engine = await makeEngine(fs);

    await expect(
      reconcileVault(engine, SCHEMA_V1, SCHEMA_NO_GADGET, {})
    ).rejects.toThrow(/injected delete failure/);

    // Point of no return passed: journal + verified targets persist, sources kept
    // (copy-not-move means the failure lost NOTHING).
    expect(await inner.exists(RECONCILE_JOURNAL_FILENAME)).toBe(true);
    expect(await inner.exists('gadgets/G-001_beta.md')).toBe(true);
    expect(await inner.exists('archive/gadgets/G-001_beta.md')).toBe(true);
    expect(JSON.parse(await inner.readFile('schema.json')).schemaVersion).toBe(1);

    // Re-run with the fault healed → roll-forward completes the recorded work.
    failDeletes = false;
    const result = (await reconcileVault(
      engine,
      SCHEMA_V1,
      SCHEMA_NO_GADGET,
      {}
    )) as ReconcileResult;
    expect(result.applied).toBe(true);
    expect(await inner.exists('gadgets/G-001_beta.md')).toBe(false);
    expect(await inner.exists('gadgets/G-002_gamma.md')).toBe(false);
    expect(await inner.exists(RECONCILE_JOURNAL_FILENAME)).toBe(false);
    expect(await inner.exists(RECONCILE_LOCK_FILENAME)).toBe(false);
    // Tombstoned exactly once; schema bumped exactly once (1 → 2, not 3).
    const tombs = await readTombstones(inner);
    expect(tombs.map((t) => t.id).sort()).toEqual(['G-001', 'G-002']);
    expect(JSON.parse(await inner.readFile('schema.json')).schemaVersion).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Folder rename
// ---------------------------------------------------------------------------

describe('reconcileVault — folder rename', () => {
  it('moves files byte-identically (no id rewrites), removes the emptied old folder', async () => {
    const fs = memFs(SCHEMA_V1, removalVaultFiles());
    await fs.createDir('gadgets');
    const engine = await makeEngine(fs);
    const before = fs.allFiles();

    const result = (await reconcileVault(
      engine,
      SCHEMA_V1,
      SCHEMA_RENAMED,
      {}
    )) as ReconcileResult;

    expect(result.plan.fileMoves.map((m) => m.targetPath).sort()).toEqual([
      'gizmos/G-001_beta.md',
      'gizmos/G-002_gamma.md',
    ]);
    // Byte-identical content at the new path — no id/frontmatter rewrites.
    expect(await fs.readFile('gizmos/G-001_beta.md')).toBe(
      before.get('gadgets/G-001_beta.md')
    );
    expect(await fs.exists('gadgets/G-001_beta.md')).toBe(false);
    expect(await fs.exists('gadgets')).toBe(false);
    expect(result.moved.sort()).toEqual(['gizmos/G-001_beta.md', 'gizmos/G-002_gamma.md']);
    expect(result.archived).toEqual([]);
    // Index rescan resolves ids at the new location.
    expect(engine.index.getPathById('G-001')).toBe('gizmos/G-001_beta.md');
    // Archived files stay put (archive is walked recursively regardless of folder name).
    expect(await fs.readFile('archive/gadgets/G-900_old.md')).toBe(
      before.get('archive/gadgets/G-900_old.md')
    );
  });

  it('refuses when the rename target folder already exists', async () => {
    const files = removalVaultFiles();
    files['gizmos/squatter.md'] = 'occupied\n';
    const fs = memFs(SCHEMA_V1, files);
    const engine = await makeEngine(fs);
    await expect(
      reconcileVault(engine, SCHEMA_V1, SCHEMA_RENAMED, { dryRun: true })
    ).rejects.toThrow(/already exists/);
  });

  it('refuses when the rename target is the archive folder', async () => {
    const toArchive = makeSchema({
      types: [WIDGET, typeDef('gadget', 'G', 'archive')],
      rels: [LINKAGE],
    });
    const fs = memFs(SCHEMA_V1, removalVaultFiles());
    const engine = await makeEngine(fs);
    await expect(
      reconcileVault(engine, SCHEMA_V1, toArchive, { dryRun: true })
    ).rejects.toThrow(/reserved/);
  });
});

// ---------------------------------------------------------------------------
// Type added + relsAdded backfill
// ---------------------------------------------------------------------------

describe('reconcileVault — type/relationship added', () => {
  async function applyAdded() {
    const fs = memFs(SCHEMA_WIDGET_ONLY, {
      'widgets/W-001_alpha.md': entityMd({
        id: 'W-001',
        type: 'widget',
        title: 'Alpha',
        // Inert under the old schema (linkage unknown) — becomes live after the change.
        extraFrontmatter: 'links_to:\n  - G-001',
        body: 'Widget body survives.',
      }),
      // On disk but invisible to the old schema's scan (gadget type unknown).
      'gadgets/G-001_beta.md': entityMd({
        id: 'G-001',
        type: 'gadget',
        title: 'Beta',
        // Stale inverse that must be PRUNED by the backfill.
        extraFrontmatter: 'linked_from:\n  - W-999',
        body: 'Gadget one body.',
      }),
    });
    const engine = await makeEngine(fs);
    const before = fs.allFiles();
    const result = (await reconcileVault(
      engine,
      SCHEMA_WIDGET_ONLY,
      SCHEMA_ADDED,
      {}
    )) as ReconcileResult;
    return { fs, engine, result, before };
  }

  it('creates the new type folder, archives nothing, leaves forward-side entities untouched', async () => {
    const { fs, result, before } = await applyAdded();
    expect(result.plan.typesAdded.sort()).toEqual(['doohickey', 'gadget']);
    expect(result.foldersCreated).toContain('doohickeys');
    expect(await fs.exists('doohickeys')).toBe(true);
    expect(result.archived).toEqual([]);
    expect(result.tombstoned).toEqual([]);
    // The widget already holds the correct forward field — byte-for-byte untouched.
    expect(await fs.readFile('widgets/W-001_alpha.md')).toBe(
      before.get('widgets/W-001_alpha.md')
    );
  });

  it('relsAdded backfill populates inverses on existing entities and prunes stale ones', async () => {
    const { fs, engine, result } = await applyAdded();
    expect(result.plan.relsAdded).toEqual(['linkage']);
    const gadget = await fs.readFile('gadgets/G-001_beta.md');
    expect(gadget).toMatch(/linked_from:\n\s+- W-001/);
    expect(gadget).not.toContain('W-999'); // stale inverse pruned
    expect(gadget).toContain('Gadget one body.'); // body preserved
    // Index reflects the backfilled inverse after the final rescan.
    expect(engine.index.getRelated('G-001', 'linked_from')).toEqual(['W-001']);
  });
});

// ---------------------------------------------------------------------------
// Pre-flight duplicate repair
// ---------------------------------------------------------------------------

describe('reconcileVault — pre-flight repairDuplicates', () => {
  it('repairs duplicate ids before archival so archive targets stay distinct', async () => {
    const fs = memFs(SCHEMA_V1, {
      'widgets/W-001_alpha.md': entityMd({ id: 'W-001', type: 'widget', title: 'Alpha' }),
      'gadgets/G-001_beta.md': entityMd({ id: 'G-001', type: 'gadget', title: 'Beta' }),
      // Duplicate id in a second file — must be reassigned, not lost.
      'gadgets/G-001_copy.md': entityMd({ id: 'G-001', type: 'gadget', title: 'Copy' }),
    });
    const engine = await makeEngine(fs);
    const result = (await reconcileVault(
      engine,
      SCHEMA_V1,
      SCHEMA_NO_GADGET,
      {}
    )) as ReconcileResult;

    expect(result.plan.collisions).toEqual([]);
    expect(result.archived.sort()).toEqual(['G-001', 'G-002']);
    // Both files survive in the archive, one under the repaired id.
    expect(await fs.readFile('archive/gadgets/G-001_beta.md')).toMatch(/^id: G-001$/m);
    expect(await fs.readFile('archive/gadgets/G-001_copy.md')).toMatch(/^id: G-002$/m);
    const tombs = await readTombstones(fs);
    expect(tombs.map((t) => t.id).sort()).toEqual(['G-001', 'G-002']);
  });
});

// ---------------------------------------------------------------------------
// Vault lock
// ---------------------------------------------------------------------------

describe('reconcileVault — vault lock', () => {
  it('takes over a stale .mcp.lock and removes the lock on completion', async () => {
    const files = removalVaultFiles();
    files[RECONCILE_LOCK_FILENAME] = 'stale-crashed-holder';
    const fs = memFs(SCHEMA_V1, files);
    const engine = await makeEngine(fs);
    const result = (await reconcileVault(
      engine,
      SCHEMA_V1,
      SCHEMA_NO_GADGET,
      {}
    )) as ReconcileResult;
    expect(result.applied).toBe(true);
    expect(await fs.exists(RECONCILE_LOCK_FILENAME)).toBe(false);
  });
});
