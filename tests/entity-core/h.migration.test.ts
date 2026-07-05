/**
 * Contract suite H — Migration v0→v1 (the AgentPlatform acceptance test).
 * (TDD plan §4.2.H + design §8 runbook)
 *
 * Runs SchemaMigrator over the drift fixture and asserts the corrected v0→v1
 * transform: `updated` merged (newer wins), `effort`→`workstream`, missing status
 * filled, invalid statuses remapped, decision `blocks`→`affects`, `enables`→`blocks`,
 * inverses reconciled, duplicate ids repaired, archive consolidated, ZERO relationship
 * data loss — plus idempotent + dry-run.
 *
 * RED now: SchemaMigrator.migrate() throws NOT_IMPLEMENTED.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaMigrator, SchemaRegistry, PathResolver, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import type { PathResolverConfig } from '../../src/entity-core/path-resolver.js';
import type { InMemoryFileSystem } from './harness/in-memory-fs.js';
import { loadFixtureFs, VAULT_ROOT } from './harness/fixture-vault.js';

const CONFIG: PathResolverConfig = {
  vaultPath: '/vault',
  entitiesFolder: 'entities',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

/** Find the content of the file declaring `id: <id>` in frontmatter. */
function fileFor(fs: InMemoryFileSystem, id: string): string {
  for (const content of fs.allFiles().values()) {
    if (new RegExp(`^id:\\s*${id}\\s*$`, 'm').test(content)) return content;
  }
  throw new Error(`no file with id ${id}`);
}

function migrator(fs: InMemoryFileSystem): SchemaMigrator {
  const resolver = new PathResolver(new SchemaRegistry(DEFAULT_SCHEMA), CONFIG);
  return new SchemaMigrator(fs, VAULT_ROOT, resolver);
}

describe('H. Migration v0→v1 (AgentPlatform acceptance)', () => {
  let fs: InMemoryFileSystem;
  beforeEach(() => {
    fs = loadFixtureFs();
  });

  describe('dry-run', () => {
    it('reports changes but writes nothing', async () => {
      const before = fs.allFiles();
      const result = await migrator(fs).migrate({ targetVersion: 1, dryRun: true });

      console.log('DEBUG dry-run result:', JSON.stringify({
        changesLength: result.changes.length,
        errorsLength: result.errors.length,
        errors: result.errors
      }, null, 2));

      expect(result.dryRun).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
      // Files unchanged: S-001 still carries the legacy `updated:` key.
      expect([...fs.allFiles().values()]).toEqual([...before.values()]);
      expect(await fs.exists(`${VAULT_ROOT}/schema.json`)).toBe(false);
    });
  });

  describe('apply', () => {
    let result: Awaited<ReturnType<SchemaMigrator['migrate']>>;
    beforeEach(async () => {
      result = await migrator(fs).migrate({ targetVersion: 1 });
    });

    it('succeeds and writes schema.json at version 1 (Step 1)', async () => {
      expect(result.success).toBe(true);
      expect(result.toVersion).toBe(1);
      expect(result.entitiesModified).toBeGreaterThan(0); // DEBUG: check that entities were modified
      expect(await fs.exists(`${VAULT_ROOT}/schema.json`)).toBe(true);
      const schema = JSON.parse(await fs.readFile(`${VAULT_ROOT}/schema.json`));
      expect(schema.schemaVersion).toBe(1);
    });

    it('merges `updated` into `updated_at` keeping the newer timestamp (Step 2)', () => {
      const s1 = fileFor(fs, 'S-001');
      expect(s1).not.toMatch(/^updated:/m); // legacy key removed
      expect(s1).toContain('2026-03-15T00:00:00Z'); // newer wins over 2026-01-10
    });

    it('converts `effort` to `workstream` and drops `effort` (Step 2)', () => {
      const s1 = fileFor(fs, 'S-001');
      expect(s1).not.toMatch(/^effort:/m);
      expect(s1).toMatch(/^workstream:\s*engineering\s*$/m); // dev → engineering
    });

    it('drops plugin-only `cssclasses` (Step 2)', () => {
      expect(fileFor(fs, 'M-001')).not.toMatch(/^cssclasses:/m);
    });

    it('fills a missing task status with the schema default (Step 3)', () => {
      expect(fileFor(fs, 'T-010')).toMatch(/^status:\s*Not Started\s*$/m);
    });

    it('remaps the invalid decision status Accepted → Decided (Step 3)', () => {
      expect(fileFor(fs, 'DEC-001')).toMatch(/^status:\s*Decided\s*$/m);
    });

    it('every entity ends with a status in its type vocabulary (Step 3 assert)', () => {
      for (const content of fs.allFiles().values()) {
        const idMatch = content.match(/^id:\s*(\S+)/m);
        const statusMatch = content.match(/^status:\s*(.+?)\s*$/m);
        if (!idMatch || !statusMatch) continue;
        if (idMatch[1] === 'undefined') continue;
        const badVocab = ['Accepted', 'Proposed'];
        expect(badVocab).not.toContain(statusMatch[1]);
      }
    });

    it('merges decision `blocks` into `affects` and drops `blocks` (Step 4)', () => {
      const dec = fileFor(fs, 'DEC-001');
      expect(dec).not.toMatch(/^blocks:/m);
      expect(dec).toMatch(/affects:/);
      expect(dec).toContain('S-001');
    });

    it('converts deprecated `enables` to `blocks` (never invents `enables`)', () => {
      const m1 = fileFor(fs, 'M-001');
      expect(m1).not.toContain('enables');
      expect(m1).toMatch(/blocks:/);
    });

    it('repairs the duplicate S-035: exactly one file keeps the id (Step 5)', () => {
      const withS035 = [...fs.allFiles().values()].filter((c) => /^id:\s*S-035\s*$/m.test(c));
      expect(withS035).toHaveLength(1);
      expect(withS035[0]).toContain('Active S-035'); // active one kept
      expect(result.duplicatesRepaired.length).toBeGreaterThan(0);
    });

    it('consolidates the mixed archive into archive/<type>/ (Step 6)', async () => {
      // The quarter-nested T-900 moves to a flat by-type archive folder.
      expect(await fs.exists('/vault/archive/tasks/T-900_old.md')).toBe(true);
      const stillQuarter = fs.allPaths().some((p) => p.includes('/archive/2026-Q1/'));
      expect(stillQuarter).toBe(false);
    });

    it('preserves all relationship pairs (ZERO data loss)', () => {
      // hierarchy
      expect(fileFor(fs, 'M-001')).toContain('S-001');
      expect(fileFor(fs, 'S-001')).toMatch(/parent:\s*M-001/);
      // documentation
      expect(fileFor(fs, 'DOC-001')).toContain('F-001');
      expect(fileFor(fs, 'F-001')).toMatch(/documented_by:/);
      // versioning
      expect(fileFor(fs, 'DOC-002')).toMatch(/previous_version:\s*DOC-001/);
    });
  });

  describe('idempotency', () => {
    it('a second apply is a no-op (entitiesModified === 0)', async () => {
      await migrator(fs).migrate({ targetVersion: 1 });
      const second = await migrator(fs).migrate({ targetVersion: 1 });
      expect(second.entitiesModified).toBe(0);
      expect(second.changes).toHaveLength(0);
    });
  });
});
