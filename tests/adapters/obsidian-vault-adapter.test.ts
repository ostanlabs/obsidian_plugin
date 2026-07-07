/**
 * ObsidianVaultAdapter — FileSystem implementation over the Obsidian Vault API.
 *
 * Runs under jest against the in-memory obsidian-mock harness (a faithful fake of
 * `app.vault`). Every FileSystem method is exercised end-to-end through a real
 * Vault instance so the adapter's TFile/TFolder branching, parent-folder creation,
 * and stat translation are covered behaviourally — not mocked away.
 */

jest.mock('obsidian', () => require('../harness/obsidian-mock'), { virtual: true });

import { ObsidianVaultAdapter } from '../../src/adapters/obsidian-vault-adapter';
import { createTestApp } from '../harness/obsidian-mock';
import type { App } from '../harness/obsidian-mock';

function make(seed: Record<string, string> = {}): { app: App; adapter: ObsidianVaultAdapter } {
  const app = createTestApp(seed);
  const adapter = new ObsidianVaultAdapter(app.vault as any);
  return { app, adapter };
}

describe('ObsidianVaultAdapter', () => {
  describe('readFile / writeFile', () => {
    it('writes a new file (creating it) and reads it back', async () => {
      const { adapter } = make();
      await adapter.writeFile('note.md', 'hello world');
      expect(await adapter.readFile('note.md')).toBe('hello world');
    });

    it('modifies an existing file in place (does not duplicate it)', async () => {
      const { app, adapter } = make({ 'note.md': 'v1' });
      await adapter.writeFile('note.md', 'v2');
      expect(await adapter.readFile('note.md')).toBe('v2');
      // Still exactly one file at that path.
      expect(app.vault._files.get('note.md')).toBe('v2');
      expect([...app.vault._files.keys()].filter((k) => k === 'note.md')).toHaveLength(1);
    });

    it('auto-creates parent folders when writing a nested path', async () => {
      const { app, adapter } = make();
      await adapter.writeFile('a/b/c/deep.md', 'x');
      expect(await adapter.readFile('a/b/c/deep.md')).toBe('x');
      // ensureFolder walked the tree and registered the leaf folder.
      expect(app.vault._folders.has('a/b/c')).toBe(true);
    });

    it('rejects reading a path that is not a file', async () => {
      const { adapter } = make();
      await expect(adapter.readFile('missing.md')).rejects.toThrow(/File not found/);
    });

    it('rejects reading a path that resolves to a folder', async () => {
      const { adapter } = make();
      await adapter.createFolder('somedir');
      await expect(adapter.readFile('somedir')).rejects.toThrow(/File not found/);
    });
  });

  describe('exists', () => {
    it('is true for an existing file, false for a missing one', async () => {
      const { adapter } = make({ 'there.md': '1' });
      expect(await adapter.exists('there.md')).toBe(true);
      expect(await adapter.exists('nope.md')).toBe(false);
    });

    it('is true for a folder path', async () => {
      const { adapter } = make();
      await adapter.createFolder('folderx');
      expect(await adapter.exists('folderx')).toBe(true);
    });
  });

  describe('deleteFile', () => {
    it('removes an existing file', async () => {
      const { adapter } = make({ 'gone.md': '1' });
      await adapter.deleteFile('gone.md');
      expect(await adapter.exists('gone.md')).toBe(false);
    });

    it('is a silent no-op for a missing file (does not throw)', async () => {
      const { adapter } = make();
      await expect(adapter.deleteFile('never.md')).resolves.toBeUndefined();
    });

    it('does not delete a folder that shares the path', async () => {
      const { adapter } = make();
      await adapter.createFolder('dir');
      await adapter.deleteFile('dir'); // not a TFile → ignored
      expect(await adapter.exists('dir')).toBe(true);
    });
  });

  describe('renameFile', () => {
    it('moves a file to a new path, creating the destination folder', async () => {
      const { adapter } = make({ 'old.md': 'body' });
      await adapter.renameFile('old.md', 'sub/new.md');
      expect(await adapter.exists('old.md')).toBe(false);
      expect(await adapter.readFile('sub/new.md')).toBe('body');
    });

    it('rejects renaming a missing source file', async () => {
      const { adapter } = make();
      await expect(adapter.renameFile('ghost.md', 'x.md')).rejects.toThrow(/File not found/);
    });
  });

  describe('listFiles', () => {
    it('returns only direct child files (not subfolders or grandchildren)', async () => {
      const { adapter } = make();
      await adapter.writeFile('folder/one.md', '1');
      await adapter.writeFile('folder/two.md', '2');
      await adapter.writeFile('folder/sub/three.md', '3');
      const files = await adapter.listFiles('folder');
      expect(files.sort()).toEqual(['folder/one.md', 'folder/two.md']);
    });

    it('returns [] for a missing folder', async () => {
      const { adapter } = make();
      expect(await adapter.listFiles('no-such-folder')).toEqual([]);
    });

    it('returns [] when the path is a file, not a folder', async () => {
      const { adapter } = make({ 'plain.md': '1' });
      expect(await adapter.listFiles('plain.md')).toEqual([]);
    });
  });

  describe('stat', () => {
    it('reports file size and a numeric mtime', async () => {
      const { adapter } = make();
      await adapter.writeFile('s.md', 'abcde');
      const st = await adapter.stat('s.md');
      expect(st.isDirectory).toBe(false);
      expect(st.size).toBe(5);
      expect(typeof st.mtimeMs).toBe('number');
      expect(st.mtimeMs).toBeGreaterThan(0);
    });

    it('reports a directory as isDirectory=true with size 0', async () => {
      const { adapter } = make();
      await adapter.createFolder('mydir');
      const st = await adapter.stat('mydir');
      expect(st.isDirectory).toBe(true);
      expect(st.size).toBe(0);
      expect(st.mtimeMs).toBe(0);
    });

    it('throws for a missing path', async () => {
      const { adapter } = make();
      await expect(adapter.stat('missing')).rejects.toThrow(/File not found/);
    });
  });

  describe('readDir', () => {
    it('lists files and subfolders with isDirectory flags and paths', async () => {
      const { adapter } = make();
      await adapter.writeFile('d/file.md', '1');
      await adapter.createDir('d/child');
      const entries = await adapter.readDir('d');
      const byName = new Map(entries.map((e) => [e.name, e]));
      expect(byName.get('file.md')?.isDirectory).toBe(false);
      expect(byName.get('file.md')?.path).toBe('d/file.md');
      expect(byName.get('child')?.isDirectory).toBe(true);
      expect(byName.get('child')?.path).toBe('d/child');
    });

    it('returns [] for a missing folder', async () => {
      const { adapter } = make();
      expect(await adapter.readDir('ghost')).toEqual([]);
    });
  });

  describe('folders: createDir / createFolder / deleteDir / deleteFolder', () => {
    it('createFolder / createDir register the folder', async () => {
      const { app, adapter } = make();
      await adapter.createFolder('fa');
      await adapter.createDir('fb');
      expect(app.vault._folders.has('fa')).toBe(true);
      expect(app.vault._folders.has('fb')).toBe(true);
    });

    it('createFolder is idempotent when the folder already exists', async () => {
      const { adapter } = make();
      await adapter.createFolder('dup');
      await expect(adapter.createFolder('dup')).resolves.toBeUndefined();
      expect(await adapter.exists('dup')).toBe(true);
    });

    it('deleteFolder / deleteDir remove the folder and its files recursively', async () => {
      const { adapter } = make({
        'box/a.md': '1',
        'box/nested/b.md': '2',
      });
      // Register the folders so getAbstractFileByPath resolves them as TFolder.
      await adapter.createFolder('box');
      await adapter.createFolder('box/nested');
      await adapter.deleteFolder('box');
      expect(await adapter.exists('box')).toBe(false);
      expect(await adapter.exists('box/a.md')).toBe(false);
      expect(await adapter.exists('box/nested/b.md')).toBe(false);
    });

    it('deleteFolder is a no-op when the path is not a folder', async () => {
      const { adapter } = make({ 'file.md': '1' });
      await expect(adapter.deleteFolder('file.md')).resolves.toBeUndefined();
      expect(await adapter.exists('file.md')).toBe(true);
    });
  });

  describe('batch: readFiles / writeFiles', () => {
    it('readFiles returns a map and skips unreadable paths', async () => {
      const { adapter } = make({ 'one.md': 'a', 'two.md': 'b' });
      const result = await adapter.readFiles(['one.md', 'two.md', 'missing.md']);
      expect(result.get('one.md')).toBe('a');
      expect(result.get('two.md')).toBe('b');
      expect(result.has('missing.md')).toBe(false);
      expect(result.size).toBe(2);
    });

    it('writeFiles writes every entry (creating parent folders)', async () => {
      const { adapter } = make();
      await adapter.writeFiles(
        new Map([
          ['x/a.md', 'A'],
          ['x/b.md', 'B'],
        ])
      );
      expect(await adapter.readFile('x/a.md')).toBe('A');
      expect(await adapter.readFile('x/b.md')).toBe('B');
    });
  });

  it('round-trips a frontmatter document byte-for-byte', async () => {
    const { adapter } = make();
    const payload = '---\nid: T-001\ntype: task\n---\n# body\n';
    await adapter.writeFile('entities/tasks/T-001_x.md', payload);
    expect(await adapter.readFile('entities/tasks/T-001_x.md')).toBe(payload);
  });
});
