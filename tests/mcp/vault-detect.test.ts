/**
 * Tests — src/mcp/vault-detect.ts (spec §7.2 steps 2+4, design §10.5, W9).
 *
 * detectVaultLayout is the adopt-mode probe for add_vault. These tests build
 * on-disk shapes on the in-memory harness and assert the detector:
 *   - classifies absent / empty / vault / non-vault correctly,
 *   - detects the REAL layout (top-level vs entities/ type folders, mixed
 *     archive layouts) so the adopter never creates a competing tree,
 *   - stays strictly read-only (no bootstrap-write during detection),
 *   - caps its probe instead of walking a huge tree exhaustively.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryFileSystem } from '../entity-core/harness/in-memory-fs.js';
import { detectVaultLayout } from '../../src/mcp/vault-detect.js';
import { DEFAULT_SCHEMA } from '../../src/entity-core/default-schema.js';
import { serializeSchema } from '../../src/entity-core/schema-bootstrap.js';
import type { Schema } from '../../src/entity-core/types.js';

function entityMd(id: string, type: string, title = `Title ${id}`): string {
  return `---\nid: ${id}\ntype: ${type}\ntitle: ${title}\nstatus: Not Started\n---\n\nBody of ${id}.\n`;
}

/** The production reality: no schema.json, TOP-LEVEL type folders, a stray
 * half-migrated entities/tasks with FEWER files, mixed archive layouts. */
function agentPlatformFixture(): InMemoryFileSystem {
  return new InMemoryFileSystem({
    '/tasks/Fix_login.md': entityMd('T-001', 'task'),
    '/tasks/Add_retention.md': entityMd('T-002', 'task'),
    '/tasks/Ship_billing.md': entityMd('T-003', 'task'),
    '/stories/Onboarding.md': entityMd('S-001', 'story'),
    '/stories/Billing.md': entityMd('S-002', 'story'),
    // Mixed archive: quarterly AND by-type subdirs.
    '/archive/2024-Q1/Old_task.md': entityMd('T-900', 'task'),
    '/archive/tasks/Done_task.md': entityMd('T-901', 'task'),
    // Stray half-migrated tree (fewer entity files than the root tree).
    '/entities/tasks/Stray.md': entityMd('T-050', 'task'),
    '/projects/Project.canvas': '{"nodes":[],"edges":[]}',
  });
}

describe('detectVaultLayout', () => {
  describe('absent / empty roots', () => {
    it('returns absent for a missing root', async () => {
      const fs = new InMemoryFileSystem();
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('absent');
      expect(d.typeFolders).toEqual([]);
      expect(d.hasSchemaJson).toBe(false);
    });

    it('returns empty for a readable root with no entries', async () => {
      const fs = new InMemoryFileSystem();
      await fs.createDir('/');
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('empty');
      expect(d.entitiesFolder).toBe('entities');
      expect(d.archiveFolder).toBe('archive');
      expect(d.archiveLayout).toBe('by-type');
      expect(d.canvasFolder).toBe('projects');
      expect(d.typeFolders).toEqual([]);
    });

    it('treats a fresh Obsidian vault (only dot-entries like .obsidian/) as empty', async () => {
      const fs = new InMemoryFileSystem({
        '/.obsidian/app.json': '{}',
        '/.DS_Store': '',
      });
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('empty');
      expect(d.typeFolders).toEqual([]);
    });
  });

  describe('AgentPlatform-shaped vault (adopt reality)', () => {
    it('detects a top-level vault with the quarterly archive marker', async () => {
      const d = await detectVaultLayout(agentPlatformFixture());
      expect(d.kind).toBe('vault');
      expect(d.entitiesFolder).toBe(''); // type folders live at the root
      expect(d.hasSchemaJson).toBe(false);
      // Both layouts present → 'quarterly' (the legacy marker needing migration).
      expect(d.archiveLayout).toBe('quarterly');
      expect(d.archiveFolder).toBe('archive');
      expect(d.canvasFolder).toBe('projects');
    });

    it('reports the stray half-migrated entities/ tree in typeFolders', async () => {
      const d = await detectVaultLayout(agentPlatformFixture());
      expect(d.typeFolders).toEqual(['entities/tasks', 'stories', 'tasks']);
    });

    it('writes nothing during detection (strictly read-only)', async () => {
      const fs = agentPlatformFixture();
      const before = fs.allPaths().sort();
      await detectVaultLayout(fs);
      expect(fs.allPaths().sort()).toEqual(before);
    });

    it('prefers entities/ when the nested tree holds MORE entity files', async () => {
      const fs = new InMemoryFileSystem({
        '/tasks/Stray_root.md': entityMd('T-001', 'task'),
        '/entities/tasks/A.md': entityMd('T-002', 'task'),
        '/entities/tasks/B.md': entityMd('T-003', 'task'),
        '/entities/tasks/C.md': entityMd('T-004', 'task'),
      });
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('vault');
      expect(d.entitiesFolder).toBe('entities');
      // The losing side is still surfaced so the caller can warn about it.
      expect(d.typeFolders).toEqual(['entities/tasks', 'tasks']);
    });
  });

  describe('modern scaffold shape', () => {
    it('detects schema.json + entities/<folders> + by-type archive', async () => {
      const fs = new InMemoryFileSystem({
        '/schema.json': serializeSchema(DEFAULT_SCHEMA),
        '/entities/tasks/Fix_login.md': entityMd('T-001', 'task'),
        '/entities/milestones/Launch.md': entityMd('M-001', 'milestone'),
        '/archive/tasks/Done.md': entityMd('T-000', 'task'),
        '/projects/Project.canvas': '{"nodes":[],"edges":[]}',
        '/workspaces.json': '{}',
      });
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('vault');
      expect(d.hasSchemaJson).toBe(true);
      expect(d.entitiesFolder).toBe('entities');
      expect(d.archiveLayout).toBe('by-type');
      expect(d.canvasFolder).toBe('projects');
      expect(d.typeFolders).toEqual(['entities/milestones', 'entities/tasks']);
    });
  });

  describe('custom schema folder names', () => {
    const questSchema: Schema = {
      ...DEFAULT_SCHEMA,
      entityTypes: DEFAULT_SCHEMA.entityTypes.map((t) =>
        t.type === 'task' ? { ...t, folder: 'quests' } : t
      ),
    };
    // A folder recognizable ONLY via the custom schema; its one .md carries no
    // id/type frontmatter, so folder recognition is the sole evidence.
    const seed = { '/quests/readme.md': '# just a note\n' };

    it('recognizes custom type folders via the provided schema param', async () => {
      const d = await detectVaultLayout(new InMemoryFileSystem(seed), questSchema);
      expect(d.kind).toBe('vault');
      expect(d.entitiesFolder).toBe('');
      expect(d.typeFolders).toEqual(['quests']);
    });

    it('the same fixture without the schema param is non-vault', async () => {
      const d = await detectVaultLayout(new InMemoryFileSystem(seed));
      expect(d.kind).toBe('non-vault');
      expect(d.typeFolders).toEqual([]);
    });
  });

  describe('frontmatter-only evidence', () => {
    it('accepts a loose entity file at the root (no recognizable folders)', async () => {
      const fs = new InMemoryFileSystem({
        '/Fix_login.md': entityMd('T-042', 'task'),
      });
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('vault');
      expect(d.hasSchemaJson).toBe(false);
      expect(d.typeFolders).toEqual([]);
      expect(d.entitiesFolder).toBe(''); // loose files sit at the top level
      expect(d.archiveLayout).toBe('by-type'); // no archive/ → modern default
    });

    it('accepts an entity file one level into a candidate folder', async () => {
      const fs = new InMemoryFileSystem({
        '/inbox/Task_one.md': entityMd('T-007', 'task'),
      });
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('vault');
      expect(d.typeFolders).toEqual([]);
    });
  });

  describe('non-vault', () => {
    it('classifies a folder of plain notes as non-vault', async () => {
      const fs = new InMemoryFileSystem({
        '/README.md': '# Hello\n\nJust a readme.\n',
        '/notes/idea.md': '---\ntitle: An idea\ntags: [x]\n---\n\nNo id/type here.\n',
        '/img/pic.png': 'binary-ish',
      });
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('non-vault');
      expect(d.typeFolders).toEqual([]);
      expect(d.hasSchemaJson).toBe(false);
    });

    it('treats an invalid schema.json as present but NOT vault evidence', async () => {
      const fs = new InMemoryFileSystem({ '/schema.json': '{ not valid json' });
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('non-vault');
      expect(d.hasSchemaJson).toBe(true); // the file exists — adopt must not overwrite it
    });
  });

  describe('archive layout', () => {
    it('archive with only quarterly subdirs is quarterly', async () => {
      const fs = new InMemoryFileSystem({
        '/tasks/One.md': entityMd('T-001', 'task'),
        '/archive/2025-Q3/Old.md': entityMd('T-900', 'task'),
      });
      const d = await detectVaultLayout(fs);
      expect(d.archiveLayout).toBe('quarterly');
    });

    it('archive with only unrecognized subdirs falls back to by-type', async () => {
      const fs = new InMemoryFileSystem({
        '/tasks/One.md': entityMd('T-001', 'task'),
        '/archive/misc/Old.md': entityMd('T-900', 'task'),
      });
      const d = await detectVaultLayout(fs);
      expect(d.archiveLayout).toBe('by-type');
    });
  });

  describe('canvas folder', () => {
    it('falls back to the first folder containing a .canvas file', async () => {
      const fs = new InMemoryFileSystem({
        '/Fix_login.md': entityMd('T-042', 'task'),
        '/boards/main.canvas': '{"nodes":[],"edges":[]}',
      });
      const d = await detectVaultLayout(fs);
      expect(d.canvasFolder).toBe('boards');
    });

    it('defaults to projects when no .canvas exists anywhere probed', async () => {
      const d = await detectVaultLayout(agentPlatformFixture());
      expect(d.canvasFolder).toBe('projects');
    });
  });

  describe('probe caps', () => {
    it('caps the frontmatter probe instead of reading every file', async () => {
      const seed: Record<string, string> = {};
      for (let i = 0; i < 60; i++) seed[`/note_${i}.md`] = `# junk note ${i}\n`;
      const fs = new InMemoryFileSystem(seed);
      let reads = 0;
      const orig = fs.readFile.bind(fs);
      fs.readFile = async (p: string) => {
        reads += 1;
        return orig(p);
      };
      const d = await detectVaultLayout(fs);
      expect(d.kind).toBe('non-vault');
      // 1 schema.json probe + at most MAX_PROBE_FILES_TOTAL (40) content reads.
      expect(reads).toBeLessThanOrEqual(41);
    });
  });
});
