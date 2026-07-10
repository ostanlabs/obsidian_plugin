/**
 * W3/W4 — buildVaultEngine + archiveEntity (MULTI_VAULT_MCP_IMPLEMENTATION_SPEC
 * §5.2/§5.4/§15). Runs entirely on the in-memory harness: the `fs` override is
 * how tests inject it, so no NodeFsAdapter/disk and no native MSRL deps load.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryFileSystem } from '../entity-core/harness/in-memory-fs.js';
import {
  buildVaultEngine,
  archiveEntity,
  ensureDefaultCanvas,
  ensureDataviewInstalled,
  enableCommunityPlugins,
} from '../../src/mcp/vault-engine.js';
import type { VaultEntry } from '../../src/mcp/types.js';
import { DEFAULT_SCHEMA } from '../../src/entity-core/default-schema.js';
import type { Schema } from '../../src/entity-core/types.js';
import { serializeSchema } from '../../src/entity-core/schema-bootstrap.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Default-layout entry (entities/ nesting, like a scaffolded vault). */
function makeEntry(overrides: Partial<VaultEntry> = {}): VaultEntry {
  return {
    id: 'test-vault',
    name: 'Test Vault',
    path: '/vaults/test',
    entitiesFolder: 'entities',
    archiveFolder: 'archive',
    archiveLayout: 'by-type',
    canvasFolder: 'projects',
    ...overrides,
  };
}

/** AgentPlatform-shaped entry: type folders at the vault ROOT (entitiesFolder ''). */
function makeAgentPlatformEntry(): VaultEntry {
  return makeEntry({ id: 'agentplatform', name: 'AgentPlatform', entitiesFolder: '' });
}

/** Toy custom 2-type schema (spec §5.4: custom type + custom folder). */
const TWO_TYPE_SCHEMA: Schema = {
  schemaVersion: 2,
  settings: {
    idPadding: 3,
    archiveLayout: 'by-type',
    filenamePattern: '{id}_{title}',
    defaultCanvas: 'projects/Project.canvas',
  } as Schema['settings'],
  entityTypes: [
    {
      type: 'widget',
      label: 'Widget',
      idPrefix: 'W',
      folder: 'widgets',
      statuses: ['New', 'Done'],
      defaultStatus: 'New',
      fields: [],
      canvas: { width: 400, height: 300, color: '3' },
    },
    {
      type: 'gadget',
      label: 'Gadget',
      idPrefix: 'G',
      folder: 'gadgets',
      statuses: ['New', 'Done'],
      defaultStatus: 'New',
      fields: [],
      canvas: { width: 400, height: 300, color: '4' },
    },
  ],
  relationships: [
    {
      name: 'linkage',
      label: 'Linkage',
      pairs: [{ from: 'widget', to: 'gadget', forward: 'links_to', reverse: 'linked_from' }],
      cardinality: { forward: 'many', reverse: 'many' },
      canvas: { color: 'gray', style: 'solid' },
      graph: { transitiveReduction: false, cyclePrevention: false },
    },
  ],
  workstreams: {
    values: ['engineering'],
    default: 'engineering',
    normalization: {},
    canvas: { engineering: { color: '3' } },
  },
};

/** Raw entity markdown (frontmatter + body), independent of the serializer. */
function entityMd(o: {
  id: string;
  type: string;
  title: string;
  status?: string;
  archived?: boolean;
  extraFrontmatter?: string;
  body?: string;
}): string {
  const extra = o.extraFrontmatter ? `${o.extraFrontmatter}\n` : '';
  return `---
id: ${o.id}
type: ${o.type}
title: ${o.title}
status: ${o.status ?? 'Not Started'}
workstream: engineering
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-02T00:00:00Z
archived: ${o.archived ?? false}
${extra}---

${o.body ?? `# ${o.title}\n`}
`;
}

// ---------------------------------------------------------------------------
// 1. Custom 2-type schema.json is reflected by the engine
// ---------------------------------------------------------------------------

describe('buildVaultEngine — custom schema vault', () => {
  async function build() {
    const fs = new InMemoryFileSystem({
      'schema.json': serializeSchema(TWO_TYPE_SCHEMA),
      'entities/widgets/W-001_alpha.md': entityMd({
        id: 'W-001',
        type: 'widget',
        title: 'Alpha',
        status: 'New',
        extraFrontmatter: 'links_to:\n  - G-001',
      }),
      'entities/gadgets/G-001_beta.md': entityMd({
        id: 'G-001',
        type: 'gadget',
        title: 'Beta',
        status: 'New',
      }),
    });
    const engine = await buildVaultEngine(makeEntry(), { fs });
    return { fs, engine };
  }

  it('loads schema.json as the active schema (source "file", no errors)', async () => {
    const { engine } = await build();
    expect(engine.schemaSource).toBe('file');
    expect(engine.schemaErrors).toEqual([]);
    expect(engine.activeSchema.schemaVersion).toBe(2);
    expect(engine.schema.getAllEntityTypes().map((t) => t.type).sort()).toEqual([
      'gadget',
      'widget',
    ]);
  });

  it('resolves custom type folders through the entry layout', async () => {
    const { engine } = await build();
    expect(engine.pathResolver.getTypeFolderPath('widget')).toBe('entities/widgets');
    expect(engine.pathResolver.getTypeFolderPath('gadget')).toBe('entities/gadgets');
  });

  it('scanIndex finds entities in the custom folders and indexes relationships', async () => {
    const { engine } = await build();
    await engine.scanIndex();
    expect(engine.index.size).toBe(2);
    expect(engine.index.getPathById('W-001')).toBe('entities/widgets/W-001_alpha.md');
    expect(engine.index.getPathById('G-001')).toBe('entities/gadgets/G-001_beta.md');
    expect(engine.index.getRelated('W-001', 'links_to')).toEqual(['G-001']);
  });

  it('carries the entry and fs on the engine', async () => {
    const { fs, engine } = await build();
    expect(engine.entry.id).toBe('test-vault');
    expect(engine.fs).toBe(fs);
  });
});

// ---------------------------------------------------------------------------
// 2. AgentPlatform-shaped vault (entitiesFolder '', nested archive)
// ---------------------------------------------------------------------------

describe('buildVaultEngine — AgentPlatform-shaped vault scan', () => {
  async function build() {
    const fs = new InMemoryFileSystem({
      'schema.json': serializeSchema(DEFAULT_SCHEMA),
      // Top-level type folders (entitiesFolder: '').
      'tasks/T-001_setup_auth.md': entityMd({ id: 'T-001', type: 'task', title: 'Setup Auth' }),
      'stories/S-001_auth.md': entityMd({
        id: 'S-001',
        type: 'story',
        title: 'Auth',
        status: 'In Progress',
      }),
      // Nested archive/<type>/ (BUG-3: must be walked recursively).
      'archive/tasks/T-900_old.md': entityMd({
        id: 'T-900',
        type: 'task',
        title: 'Old',
        status: 'Completed',
        archived: true,
      }),
      // Even deeper nesting (quarter layout) must be reached too.
      'archive/2026-Q1/tasks/T-901_older.md': entityMd({
        id: 'T-901',
        type: 'task',
        title: 'Older',
        status: 'Completed',
        archived: true,
      }),
      // Stale archived duplicate of the LIVE S-001 — live copy must win.
      'archive/stories/S-001_stale.md': entityMd({
        id: 'S-001',
        type: 'story',
        title: 'Auth (stale)',
        status: 'Completed',
        archived: true,
      }),
      // Unparseable + non-md files are skipped, not fatal.
      'tasks/notes.md': 'just some markdown without frontmatter\n',
      'tasks/diagram.png': 'not markdown at all',
    });
    const engine = await buildVaultEngine(makeAgentPlatformEntry(), { fs });
    await engine.scanIndex();
    return engine;
  }

  it('scans top-level type folders when entitiesFolder is ""', async () => {
    const engine = await build();
    expect(engine.pathResolver.getTypeFolderPath('task')).toBe('tasks');
    expect(engine.index.getPathById('T-001')).toBe('tasks/T-001_setup_auth.md');
  });

  it('walks the archive folder recursively (nested archive/<type>/ and deeper)', async () => {
    const engine = await build();
    expect(engine.index.getPathById('T-900')).toBe('archive/tasks/T-900_old.md');
    expect(engine.index.get('T-900')?.archived).toBe(true);
    expect(engine.index.getPathById('T-901')).toBe('archive/2026-Q1/tasks/T-901_older.md');
  });

  it('live copy wins over an archived duplicate (archive scanned first)', async () => {
    const engine = await build();
    expect(engine.index.getPathById('S-001')).toBe('stories/S-001_auth.md');
    expect(engine.index.get('S-001')?.archived).toBe(false);
    expect(engine.index.get('S-001')?.status).toBe('In Progress');
  });

  it('skips unparseable and non-markdown files', async () => {
    const engine = await build();
    // 4 real entities; the frontmatter-less .md and the .png contribute nothing.
    expect(engine.index.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 3. applySchema — new type resolves through a REBUILT pathResolver
// ---------------------------------------------------------------------------

describe('applySchema', () => {
  it('a type added via applySchema resolves paths (no "Unknown entity type")', async () => {
    const fs = new InMemoryFileSystem({ 'schema.json': serializeSchema(DEFAULT_SCHEMA) });
    const engine = await buildVaultEngine(makeEntry(), { fs });
    expect(() => engine.pathResolver.getTypeFolderPath('risk')).toThrow(/Unknown entity type/);

    const withRisk: Schema = {
      ...DEFAULT_SCHEMA,
      entityTypes: [
        ...DEFAULT_SCHEMA.entityTypes,
        {
          type: 'risk',
          label: 'Risk',
          idPrefix: 'R',
          folder: 'risks',
          statuses: ['Open', 'Mitigated'],
          defaultStatus: 'Open',
          fields: [],
          canvas: { width: 400, height: 300, color: '1' },
        },
      ],
    };
    engine.applySchema(withRisk);

    // The stale-resolver bug (fixed v1.9.0): this must resolve post-applySchema.
    expect(engine.pathResolver.getTypeFolderPath('risk')).toBe('entities/risks');
    // Existing types still resolve, and the live schema references updated.
    expect(engine.pathResolver.getTypeFolderPath('task')).toBe('entities/tasks');
    expect(engine.activeSchema).toBe(withRisk);
    expect(engine.schema.getEntityType('risk')?.folder).toBe('risks');
  });

  it('scanIndex after applySchema scans the new type folder', async () => {
    const fs = new InMemoryFileSystem({
      'schema.json': serializeSchema(DEFAULT_SCHEMA),
      'entities/risks/R-001_outage.md': entityMd({
        id: 'R-001',
        type: 'risk',
        title: 'Outage',
        status: 'Open',
      }),
    });
    const engine = await buildVaultEngine(makeEntry(), { fs });
    await engine.scanIndex();
    expect(engine.index.has('R-001')).toBe(false); // unknown type folder not scanned yet

    engine.applySchema({
      ...DEFAULT_SCHEMA,
      entityTypes: [
        ...DEFAULT_SCHEMA.entityTypes,
        {
          type: 'risk',
          label: 'Risk',
          idPrefix: 'R',
          folder: 'risks',
          statuses: ['Open'],
          defaultStatus: 'Open',
          fields: [],
          canvas: { width: 400, height: 300, color: '1' },
        },
      ],
    });
    await engine.scanIndex();
    expect(engine.index.getPathById('R-001')).toBe('entities/risks/R-001_outage.md');
  });
});

// ---------------------------------------------------------------------------
// 4. archiveEntity — copy → verify → delete, never overwrite
// ---------------------------------------------------------------------------

describe('archiveEntity', () => {
  const BODY = '# Setup Auth\n\nThe original markdown body survives archiving.\n';

  async function build(extraFiles: Record<string, string> = {}) {
    const fs = new InMemoryFileSystem({
      'schema.json': serializeSchema(DEFAULT_SCHEMA),
      'tasks/T-001_setup_auth.md': entityMd({
        id: 'T-001',
        type: 'task',
        title: 'Setup Auth',
        status: 'Completed',
        body: BODY,
      }),
      ...extraFiles,
    });
    const engine = await buildVaultEngine(makeAgentPlatformEntry(), { fs });
    await engine.scanIndex();
    return { fs, engine };
  }

  it('copies to archive with archived: true, verifies, THEN deletes the original', async () => {
    const { fs, engine } = await build();
    const { from, to } = await archiveEntity(engine, 'T-001');

    expect(from).toBe('tasks/T-001_setup_auth.md');
    expect(to).toBe(engine.pathResolver.getArchivePath('T-001', 'Setup Auth'));
    expect(to.startsWith('archive/tasks/')).toBe(true);
    const archivedRaw = await fs.readFile(to);
    expect(archivedRaw).toMatch(/^archived: true$/m);
    expect(archivedRaw).toContain('The original markdown body survives archiving.');
    await expect(fs.readFile('tasks/T-001_setup_auth.md')).rejects.toThrow(/ENOENT/);
  });

  it('updates the index entry: archived flag + new path', async () => {
    const { engine } = await build();
    const { to } = await archiveEntity(engine, 'T-001');
    expect(engine.index.get('T-001')?.archived).toBe(true);
    expect(engine.index.getPathById('T-001')).toBe(to);
  });

  it('throws and leaves the source intact when the archive target already exists', async () => {
    const { fs, engine } = await build();
    // Occupy the exact archive target BEFORE archiving.
    const target = engine.pathResolver.getArchivePath('T-001', 'Setup Auth');
    await fs.writeFile(
      target,
      entityMd({
        id: 'T-001',
        type: 'task',
        title: 'Setup Auth',
        status: 'Completed',
        archived: true,
        body: 'PRE-EXISTING ARCHIVE COPY\n',
      })
    );

    await expect(archiveEntity(engine, 'T-001')).rejects.toThrow(/already exists/);
    // Source untouched, pre-existing target NOT overwritten, index unchanged.
    expect(await fs.readFile('tasks/T-001_setup_auth.md')).toContain('survives archiving');
    expect(await fs.readFile(target)).toContain('PRE-EXISTING ARCHIVE COPY');
    expect(engine.index.get('T-001')?.archived).toBe(false);
    expect(engine.index.getPathById('T-001')).toBe('tasks/T-001_setup_auth.md');
  });

  it('throws for an id the index does not know', async () => {
    const { engine } = await build();
    await expect(archiveEntity(engine, 'T-999')).rejects.toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Schema bootstrap — no schema.json → default written; file → 'file'
// ---------------------------------------------------------------------------

describe('buildVaultEngine — schema bootstrap', () => {
  it('bootstrap-writes the default schema when schema.json is absent', async () => {
    const fs = new InMemoryFileSystem();
    const engine = await buildVaultEngine(makeEntry(), { fs });
    expect(engine.schemaSource).toBe('default');
    expect(engine.schemaErrors).toEqual([]);
    const written = JSON.parse(await fs.readFile('schema.json'));
    expect(written.schemaVersion).toBe(DEFAULT_SCHEMA.schemaVersion);
    // A second engine over the same vault now reads the bootstrapped FILE.
    const second = await buildVaultEngine(makeEntry(), { fs });
    expect(second.schemaSource).toBe('file');
  });

  it('surfaces errors and falls back to default when schema.json is invalid', async () => {
    const fs = new InMemoryFileSystem({ 'schema.json': '{ not valid json' });
    const engine = await buildVaultEngine(makeEntry(), { fs });
    expect(engine.schemaSource).toBe('default');
    expect(engine.schemaErrors.length).toBeGreaterThan(0);
    // Invalid file is NOT clobbered by the bootstrap.
    expect(await fs.readFile('schema.json')).toBe('{ not valid json');
  });
});

// ---------------------------------------------------------------------------
// 6. msrl() — lazy, overridable, created once
// ---------------------------------------------------------------------------

describe('msrl()', () => {
  it('does not create the engine until called, then caches a single instance', async () => {
    const fs = new InMemoryFileSystem({ 'schema.json': serializeSchema(DEFAULT_SCHEMA) });
    let calls = 0;
    const fake = { query: async () => [] } as never;
    const engine = await buildVaultEngine(makeEntry(), {
      fs,
      msrlFactory: async (entry) => {
        calls++;
        expect(entry.path).toBe('/vaults/test');
        return fake;
      },
    });
    expect(calls).toBe(0); // lazy — nothing at build time
    const a = await engine.msrl();
    const b = await engine.msrl();
    expect(a).toBe(fake);
    expect(b).toBe(fake);
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. ensureDefaultCanvas — parameterized bootstrap helper
// ---------------------------------------------------------------------------

describe('ensureDefaultCanvas', () => {
  it('creates the schema-declared default canvas when missing', async () => {
    const fs = new InMemoryFileSystem();
    await ensureDefaultCanvas(fs, DEFAULT_SCHEMA);
    const content = await fs.readFile('projects/Project.canvas');
    expect(JSON.parse(content)).toEqual({ nodes: [], edges: [] });
  });

  it('repairs an empty canvas but leaves real content untouched', async () => {
    const fs = new InMemoryFileSystem({
      'projects/Project.canvas': '   \n',
      'projects/Other.canvas': '{"nodes":[{"id":"x"}],"edges":[]}',
    });
    await ensureDefaultCanvas(fs, DEFAULT_SCHEMA);
    expect(JSON.parse(await fs.readFile('projects/Project.canvas'))).toEqual({
      nodes: [],
      edges: [],
    });
    await ensureDefaultCanvas(fs, {
      ...DEFAULT_SCHEMA,
      settings: { ...DEFAULT_SCHEMA.settings, defaultCanvas: 'projects/Other.canvas' },
    });
    expect(await fs.readFile('projects/Other.canvas')).toBe(
      '{"nodes":[{"id":"x"}],"edges":[]}'
    );
  });
});

describe('enableCommunityPlugins + ensureDataviewInstalled', () => {
  const DV_MANIFEST = JSON.stringify({ id: 'dataview', version: '0.5.68' });

  function stubFetcher(map: Record<string, string | null>) {
    const calls: string[] = [];
    const fetcher = async (url: string): Promise<string | null> => {
      calls.push(url);
      const name = url.slice(url.lastIndexOf('/') + 1);
      return name in map ? map[name] : null;
    };
    return { fetcher, calls };
  }

  it('enableCommunityPlugins merges ids and preserves existing entries (idempotent)', async () => {
    const fs = new InMemoryFileSystem({
      '.obsidian/community-plugins.json': JSON.stringify(['some-other-plugin']),
    });
    await enableCommunityPlugins(fs, ['dataview']);
    await enableCommunityPlugins(fs, ['dataview']); // idempotent
    expect(JSON.parse(await fs.readFile('.obsidian/community-plugins.json'))).toEqual([
      'some-other-plugin',
      'dataview',
    ]);
  });

  it('downloads Dataview via the fetcher, writes the plugin files, and enables it', async () => {
    const fs = new InMemoryFileSystem({
      '.obsidian/community-plugins.json': JSON.stringify(['canvas-project-manager']),
    });
    const { fetcher, calls } = stubFetcher({
      'manifest.json': DV_MANIFEST,
      'main.js': 'dv-main',
      'styles.css': 'dv-css',
    });
    await ensureDataviewInstalled(fs, fetcher);
    expect(calls).toHaveLength(3);
    expect(await fs.readFile('.obsidian/plugins/dataview/manifest.json')).toBe(DV_MANIFEST);
    expect(await fs.readFile('.obsidian/plugins/dataview/main.js')).toBe('dv-main');
    expect(await fs.readFile('.obsidian/plugins/dataview/styles.css')).toBe('dv-css');
    expect(JSON.parse(await fs.readFile('.obsidian/community-plugins.json'))).toEqual([
      'canvas-project-manager',
      'dataview',
    ]);
  });

  it('already installed → no network calls, but still ensures it is enabled', async () => {
    const fs = new InMemoryFileSystem({
      '.obsidian/plugins/dataview/manifest.json': DV_MANIFEST,
    });
    const { fetcher, calls } = stubFetcher({});
    await ensureDataviewInstalled(fs, fetcher);
    expect(calls).toHaveLength(0);
    expect(JSON.parse(await fs.readFile('.obsidian/community-plugins.json'))).toEqual(['dataview']);
  });

  it('download failure (offline) → warns and skips, writes nothing, does not throw', async () => {
    const fs = new InMemoryFileSystem({});
    const { fetcher } = stubFetcher({ 'manifest.json': null, 'main.js': null, 'styles.css': null });
    await expect(ensureDataviewInstalled(fs, fetcher)).resolves.toBeUndefined();
    expect(await fs.exists('.obsidian/plugins/dataview/manifest.json')).toBe(false);
    expect(await fs.exists('.obsidian/community-plugins.json')).toBe(false);
  });

  it('rejects a downloaded manifest whose id is not dataview (tamper/redirect guard)', async () => {
    const fs = new InMemoryFileSystem({});
    const { fetcher } = stubFetcher({
      'manifest.json': JSON.stringify({ id: 'evil-plugin', version: '1.0.0' }),
      'main.js': 'evil',
      'styles.css': '',
    });
    await ensureDataviewInstalled(fs, fetcher);
    expect(await fs.exists('.obsidian/plugins/dataview/manifest.json')).toBe(false);
  });
});
