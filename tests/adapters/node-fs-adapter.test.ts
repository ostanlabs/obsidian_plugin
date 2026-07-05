/**
 * NodeFsAdapter — FileSystem implementation over Node's fs/promises.
 *
 * Runs under jest (this file lives outside the vitest `include`). Exercises
 * every method against a real temp dir created with fs.mkdtempSync, and asserts
 * that vault-relative paths (with or without a leading slash) resolve by joining
 * the vault base.
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { NodeFsAdapter } from '../../src/adapters/node-fs-adapter';

describe('NodeFsAdapter', () => {
  let vaultDir: string;
  let adapter: NodeFsAdapter;

  beforeEach(() => {
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodefs-'));
    adapter = new NodeFsAdapter(vaultDir);
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  describe('path resolution', () => {
    it('joins vault base and strips a leading slash', async () => {
      await adapter.writeFile('/notes/a.md', 'hello');
      // Written under the vault base with the leading slash stripped.
      const onDisk = path.join(vaultDir, 'notes', 'a.md');
      expect(fs.existsSync(onDisk)).toBe(true);
      expect(fs.readFileSync(onDisk, 'utf-8')).toBe('hello');
    });

    it('treats a relative path the same as an absolute one', async () => {
      await adapter.writeFile('rel.md', 'x');
      expect(fs.existsSync(path.join(vaultDir, 'rel.md'))).toBe(true);
    });
  });

  describe('read/write', () => {
    it('writes then reads back the same content', async () => {
      await adapter.writeFile('doc.md', 'content-123');
      expect(await adapter.readFile('doc.md')).toBe('content-123');
    });

    it('auto-creates parent directories on write', async () => {
      await adapter.writeFile('deep/nested/dir/file.md', 'ok');
      expect(await adapter.readFile('deep/nested/dir/file.md')).toBe('ok');
    });

    it('rejects reading a missing file', async () => {
      await expect(adapter.readFile('missing.md')).rejects.toThrow();
    });
  });

  describe('exists', () => {
    it('returns true for an existing file and false otherwise', async () => {
      await adapter.writeFile('there.md', '1');
      expect(await adapter.exists('there.md')).toBe(true);
      expect(await adapter.exists('nope.md')).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('removes a file', async () => {
      await adapter.writeFile('gone.md', '1');
      await adapter.deleteFile('gone.md');
      expect(await adapter.exists('gone.md')).toBe(false);
    });
  });

  describe('renameFile', () => {
    it('moves a file, creating the destination directory', async () => {
      await adapter.writeFile('old.md', 'body');
      await adapter.renameFile('old.md', 'sub/new.md');
      expect(await adapter.exists('old.md')).toBe(false);
      expect(await adapter.readFile('sub/new.md')).toBe('body');
    });
  });

  describe('stat', () => {
    it('reports file metadata', async () => {
      await adapter.writeFile('s.md', 'abcde');
      const st = await adapter.stat('s.md');
      expect(st.isDirectory).toBe(false);
      expect(st.size).toBe(5);
      expect(typeof st.mtimeMs).toBe('number');
    });

    it('reports directory metadata', async () => {
      await adapter.createDir('mydir');
      const st = await adapter.stat('mydir');
      expect(st.isDirectory).toBe(true);
    });
  });

  describe('listFiles', () => {
    it('returns only files (not subdirectories), path-joined to the folder', async () => {
      await adapter.writeFile('folder/one.md', '1');
      await adapter.writeFile('folder/two.md', '2');
      await adapter.writeFile('folder/sub/three.md', '3');
      const files = await adapter.listFiles('folder');
      expect(files.sort()).toEqual([
        path.join('folder', 'one.md'),
        path.join('folder', 'two.md'),
      ]);
    });

    it('returns [] for a missing folder', async () => {
      expect(await adapter.listFiles('no-such-folder')).toEqual([]);
    });
  });

  describe('readDir', () => {
    it('lists files and directories with isDirectory flags', async () => {
      await adapter.writeFile('d/file.md', '1');
      await adapter.createDir('d/child');
      const entries = await adapter.readDir('d');
      const byName = new Map(entries.map((e) => [e.name, e]));
      expect(byName.get('file.md')?.isDirectory).toBe(false);
      expect(byName.get('child')?.isDirectory).toBe(true);
      expect(byName.get('file.md')?.path).toBe(path.join('d', 'file.md'));
    });

    it('returns [] for a missing folder', async () => {
      expect(await adapter.readDir('ghost')).toEqual([]);
    });
  });

  describe('createDir / deleteDir / deleteFolder / createFolder', () => {
    it('creates and deletes directories', async () => {
      await adapter.createDir('a/b/c');
      expect(fs.existsSync(path.join(vaultDir, 'a', 'b', 'c'))).toBe(true);
      await adapter.deleteDir('a', { recursive: true });
      expect(fs.existsSync(path.join(vaultDir, 'a'))).toBe(false);
    });

    it('createFolder and deleteFolder behave the same way', async () => {
      await adapter.createFolder('folderx');
      expect(fs.existsSync(path.join(vaultDir, 'folderx'))).toBe(true);
      await adapter.writeFile('folderx/f.md', '1');
      await adapter.deleteFolder('folderx');
      expect(fs.existsSync(path.join(vaultDir, 'folderx'))).toBe(false);
    });
  });

  describe('batch operations', () => {
    it('readFiles returns a map and skips unreadable paths', async () => {
      await adapter.writeFile('one.md', 'a');
      await adapter.writeFile('two.md', 'b');
      const result = await adapter.readFiles(['one.md', 'two.md', 'missing.md']);
      expect(result.get('one.md')).toBe('a');
      expect(result.get('two.md')).toBe('b');
      expect(result.has('missing.md')).toBe(false);
      expect(result.size).toBe(2);
    });

    it('writeFiles writes every entry', async () => {
      await adapter.writeFiles(new Map([
        ['x/a.md', 'A'],
        ['x/b.md', 'B'],
      ]));
      expect(await adapter.readFile('x/a.md')).toBe('A');
      expect(await adapter.readFile('x/b.md')).toBe('B');
    });
  });

  describe('deleteFile error propagation', () => {
    it('rejects when deleting a missing file', async () => {
      await expect(adapter.deleteFile('never-existed.md')).rejects.toThrow();
    });
  });

  // Cross-check: content written through the adapter is byte-identical on disk
  // via the raw fs API (proves no path-mangling / encoding surprises).
  it('round-trips through the raw fs API', async () => {
    const payload = '---\nid: T-001\n---\n# body\n';
    await adapter.writeFile('/raw/check.md', payload);
    const raw = await fsp.readFile(path.join(vaultDir, 'raw', 'check.md'), 'utf-8');
    expect(raw).toBe(payload);
  });
});
