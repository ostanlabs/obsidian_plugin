/**
 * EntityCoreFacade — the plugin↔entity-core bridge.
 *
 * Wired end-to-end over the in-memory harness: an ObsidianVaultAdapter sits over a
 * seeded Vault, and the index-dependent modules are initialised with a real plugin
 * EntityIndex wrapped in an EntityIndexAdapter. We assert the facade delegates to
 * each entity-core collaborator (parser/serializer/validator/path-resolver/
 * id-allocator/relationship-graph) and enforces its "not initialised" guards.
 *
 * NOTE: vaultPath is '' so PathResolver.toAbsolutePath yields '/<rel>' which the
 * harness's normalizePath collapses back to the vault-relative key — letting the
 * RelationshipGraph's absolute↔relative path handling round-trip in-memory.
 */

jest.mock('obsidian', () => require('./harness/obsidian-mock'), { virtual: true });

import { EntityCoreFacade } from '../src/entity-core-facade';
import { SchemaRegistry } from '../src/entity-core/schema-registry';
import { ObsidianVaultAdapter } from '../src/adapters/obsidian-vault-adapter';
import { RelationshipGraph } from '../src/entity-core/relationship-graph';
import { CanvasManager } from '../src/entity-core/canvas';
import { SchemaMigrator } from '../src/entity-core/migrator';
import { EntityIndexAdapter } from '../src/adapters/entity-index-adapter';
import { EntityIndex } from '../util/entityNavigator';
import { DEFAULT_SCHEMA } from '../src/entity-core/default-schema';
import { createTestApp } from './harness/obsidian-mock';
import type { App } from './harness/obsidian-mock';
import type { RuntimeEntity } from '../src/entity-core/types';

function fm(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields).map(([k, v]) =>
    Array.isArray(v) ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`
  );
  return `---\n${lines.join('\n')}\n---\n`;
}

function makeFacade(seed: Record<string, string> = {}): { app: App; facade: EntityCoreFacade } {
  const app = createTestApp(seed);
  const facade = new EntityCoreFacade({
    vault: app.vault as any,
    vaultPath: '',
    // Canonical bare-folder layout: empty entitiesFolder prefix.
    entitiesFolder: '',
    archiveFolder: 'archive',
    canvasFolder: 'projects',
  });
  return { app, facade };
}

/** Build an EntityIndexAdapter over the plugin's real index for a seeded app. */
async function indexAdapter(app: App): Promise<EntityIndexAdapter> {
  const idx = new EntityIndex(app as any, {} as any);
  await idx.buildIndex();
  return new EntityIndexAdapter(idx, new SchemaRegistry(DEFAULT_SCHEMA));
}

describe('EntityCoreFacade', () => {
  // ---------------------------------------------------------------------------
  // Stateless operations (no index required)
  // ---------------------------------------------------------------------------
  describe('parse / serialize / validate (delegating to entity-core)', () => {
    it('parseEntity extracts system fields, custom fields, relationships and passthrough', () => {
      const { facade } = makeFacade();
      const content = fm({
        id: 'S-001',
        type: 'story',
        title: 'Build it',
        status: 'In Progress',
        workstream: 'engineering',
        priority: 'High',
        depends_on: ['S-000'],
        notion_page_id: 'abc123',
      });
      const entity = facade.parseEntity(content, 'entities/stories/S-001_build_it.md');
      expect(entity.id).toBe('S-001');
      expect(entity.type).toBe('story');
      expect(entity.status).toBe('In Progress');
      expect(entity.fields.priority).toBe('High');
      expect(entity.relationships.depends_on).toEqual(['S-000']);
      expect(entity.passthrough?.notion_page_id).toBe('abc123');
    });

    it('serializeEntity → parseEntity round-trips the entity', () => {
      const { facade } = makeFacade();
      const original = facade.parseEntity(
        fm({ id: 'T-007', type: 'task', title: 'Do', status: 'Not Started', goal: 'ship' }),
        'entities/tasks/T-007_do.md'
      );
      const md = facade.serializeEntity(original);
      expect(md.startsWith('---\n')).toBe(true);
      const reparsed = facade.parseEntity(md, 'entities/tasks/T-007_do.md');
      expect(reparsed.id).toBe('T-007');
      expect(reparsed.type).toBe('task');
      expect(reparsed.title).toBe('Do');
      expect(reparsed.fields.goal).toBe('ship');
    });

    it('validateEntity returns [] for a valid entity', () => {
      const { facade } = makeFacade();
      const entity = facade.parseEntity(
        fm({ id: 'M-001', type: 'milestone', title: 'M', status: 'In Progress', priority: 'High' }),
        'entities/milestones/M-001_m.md'
      );
      expect(facade.validateEntity(entity)).toEqual([]);
    });

    it('validateEntity flags an out-of-vocabulary status', () => {
      const { facade } = makeFacade();
      const entity = facade.parseEntity(
        fm({ id: 'DEC-001', type: 'decision', title: 'D', status: 'In Progress' }),
        'entities/decisions/DEC-001_d.md'
      );
      const errors = facade.validateEntity(entity);
      expect(errors.some((e) => e.code === 'invalid_status' && e.field === 'status')).toBe(true);
    });
  });

  describe('path helpers (delegating to PathResolver)', () => {
    it('generateFilename applies the canonical title-only, preserve-case pattern', () => {
      const { facade } = makeFacade();
      expect(facade.generateFilename('S-001', 'Build the Thing!')).toBe('Build_the_Thing.md');
    });

    it('getTypeFolderPath routes each type to its BARE folder (no entities/ prefix)', () => {
      const { facade } = makeFacade();
      expect(facade.getTypeFolderPath('milestone')).toBe('milestones');
      expect(facade.getTypeFolderPath('feature')).toBe('features');
    });

    it('getTypeFolderPath throws for an unknown type', () => {
      const { facade } = makeFacade();
      expect(() => facade.getTypeFolderPath('gremlin')).toThrow(/Unknown entity type/);
    });
  });

  describe('accessors', () => {
    it('getSchema returns a SchemaRegistry seeded with the default schema', () => {
      const { facade } = makeFacade();
      const schema = facade.getSchema();
      expect(schema).toBeInstanceOf(SchemaRegistry);
      expect(schema.getEntityType('milestone')?.idPrefix).toBe('M');
    });

    it('getFileSystem returns an ObsidianVaultAdapter wired to the vault', async () => {
      const { app, facade } = makeFacade();
      const fs = facade.getFileSystem();
      expect(fs).toBeInstanceOf(ObsidianVaultAdapter);
      await fs.writeFile('entities/tasks/T-001_x.md', 'hello');
      expect(app.vault._files.get('entities/tasks/T-001_x.md')).toBe('hello');
      expect(await fs.readFile('entities/tasks/T-001_x.md')).toBe('hello');
    });
  });

  // ---------------------------------------------------------------------------
  // Index-dependent guards
  // ---------------------------------------------------------------------------
  describe('guards before initializeWithIndex()', () => {
    it('allocateId rejects', async () => {
      const { facade } = makeFacade();
      await expect(facade.allocateId('milestone')).rejects.toThrow(/not initialized with index/);
    });

    it('getRelationshipGraph / getCanvasManager / getMigrator throw', () => {
      const { facade } = makeFacade();
      expect(() => facade.getRelationshipGraph()).toThrow(/not initialized with index/);
      expect(() => facade.getCanvasManager()).toThrow(/not initialized with index/);
      expect(() => facade.getMigrator()).toThrow(/not initialized with index/);
    });
  });

  // ---------------------------------------------------------------------------
  // Index-dependent operations (after initializeWithIndex)
  // ---------------------------------------------------------------------------
  describe('after initializeWithIndex()', () => {
    it('allocateId returns per-type max+1 over existing (incl. archived) ids', async () => {
      const seed = {
        'entities/milestones/M-001_a.md': fm({ id: 'M-001', type: 'milestone', title: 'A' }),
        'entities/milestones/M-002_b.md': fm({ id: 'M-002', type: 'milestone', title: 'B' }),
        'archive/milestones/M-005_c.md': fm({ id: 'M-005', type: 'milestone', title: 'C' }),
      };
      const { app, facade } = makeFacade(seed);
      facade.initializeWithIndex(await indexAdapter(app));
      // max is M-005 (archived counts) → next is M-006, padded to 3 digits.
      expect(await facade.allocateId('milestone')).toBe('M-006');
      // A type with no existing ids starts at 1.
      expect(await facade.allocateId('story')).toBe('S-001');
    });

    it('getRelationshipGraph / getCanvasManager / getMigrator return live collaborators', async () => {
      const { app, facade } = makeFacade();
      facade.initializeWithIndex(await indexAdapter(app));
      expect(facade.getRelationshipGraph()).toBeInstanceOf(RelationshipGraph);
      expect(facade.getCanvasManager()).toBeInstanceOf(CanvasManager);
      expect(facade.getMigrator()).toBeInstanceOf(SchemaMigrator);
    });

    it('relationshipGraph.wouldCreateCycle reads adjacency through the wired index', async () => {
      // M-002 depends_on M-001; adding M-001 → M-002 would close a cycle.
      const seed = {
        'entities/milestones/M-001_a.md': fm({ id: 'M-001', type: 'milestone', title: 'A' }),
        'entities/milestones/M-002_b.md': fm({
          id: 'M-002',
          type: 'milestone',
          title: 'B',
          depends_on: ['M-001'],
        }),
      };
      const { app, facade } = makeFacade(seed);
      facade.initializeWithIndex(await indexAdapter(app));
      const graph = facade.getRelationshipGraph();

      const closing = graph.wouldCreateCycle('dependency', 'M-001', 'M-002');
      expect(closing.hasCycle).toBe(true);
      expect(closing.cyclePath).toContain('M-001');

      // The opposite direction is already the existing edge → no NEW cycle.
      expect(graph.wouldCreateCycle('dependency', 'M-002', 'M-001').hasCycle).toBe(false);

      // A brand-new acyclic graph reports no cycles at all.
      expect(graph.detectCycles('dependency')).toEqual([]);
    });

    it('relationshipGraph.syncBidirectional writes the inverse edge into the vault file', async () => {
      // Seed a source (M-001) that depends_on M-002, and the target M-002 with no inverse yet.
      const seed = {
        'entities/milestones/M-001_a.md': fm({
          id: 'M-001',
          type: 'milestone',
          title: 'A',
          depends_on: ['M-002'],
        }),
        'entities/milestones/M-002_b.md': fm({ id: 'M-002', type: 'milestone', title: 'B' }),
      };
      const { app, facade } = makeFacade(seed);
      facade.initializeWithIndex(await indexAdapter(app));
      const graph = facade.getRelationshipGraph() as RelationshipGraph;

      const source: RuntimeEntity = facade.parseEntity(
        seed['entities/milestones/M-001_a.md'],
        'entities/milestones/M-001_a.md'
      );
      // pathResolver is private on the facade; reconstruct an equivalent one for the call.
      const pathResolver = (facade as unknown as { pathResolver: any }).pathResolver;
      await graph.syncBidirectional(source, null, facade.getFileSystem(), pathResolver);

      // depends_on's inverse is `blocks` → M-002 should now list M-001 under blocks.
      const updated = app.vault._files.get('entities/milestones/M-002_b.md')!;
      expect(updated).toMatch(/blocks:/);
      expect(updated).toContain('M-001');
    });
  });
});
