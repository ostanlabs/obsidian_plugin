/**
 * InMemoryFileSystem — the single backing store for ALL tests (no tmp-dir disk).
 *
 * This is REAL harness code (not a stubbed engine class): it faithfully implements
 * the FileSystem interface over an in-memory Map. Paths are treated as opaque
 * strings; directories are implicit (a dir "exists" if any file is under it).
 */

import type {
  Disposable,
  FileEntry,
  FileStat,
  FileSystem,
} from '../../src/types.js';

interface StoredFile {
  content: string;
  mtimeMs: number;
}

function normalize(p: string): string {
  // Collapse duplicate slashes, strip trailing slash (except root).
  const n = p.replace(/\/+/g, '/').replace(/\/$/, '');
  return n === '' ? '/' : n;
}

function dirOf(p: string): string {
  const n = normalize(p);
  const idx = n.lastIndexOf('/');
  return idx <= 0 ? '/' : n.slice(0, idx);
}

function baseOf(p: string): string {
  const n = normalize(p);
  const idx = n.lastIndexOf('/');
  return idx < 0 ? n : n.slice(idx + 1);
}

export class InMemoryFileSystem implements FileSystem {
  private files = new Map<string, StoredFile>();
  private explicitDirs = new Set<string>();
  private clock = 1;

  constructor(seed?: Record<string, string> | Map<string, string>) {
    if (seed) this.seed(seed);
  }

  /** Bulk-seed files. Keys are paths, values are contents. */
  seed(map: Record<string, string> | Map<string, string>): void {
    const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
    for (const [path, content] of entries) {
      this.files.set(normalize(path), { content, mtimeMs: this.clock++ });
    }
  }

  /** All current files as a path→content map (test inspection helper). */
  allFiles(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [k, v] of this.files) out.set(k, v.content);
    return out;
  }

  /** All file paths (test inspection helper). */
  allPaths(): string[] {
    return [...this.files.keys()];
  }

  async readFile(path: string): Promise<string> {
    const f = this.files.get(normalize(path));
    if (!f) throw new Error(`ENOENT: no such file: ${path}`);
    return f.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(normalize(path), { content, mtimeMs: this.clock++ });
  }

  async deleteFile(path: string): Promise<void> {
    const n = normalize(path);
    if (!this.files.delete(n)) throw new Error(`ENOENT: no such file: ${path}`);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const from = normalize(oldPath);
    const to = normalize(newPath);
    const f = this.files.get(from);
    if (!f) throw new Error(`ENOENT: no such file: ${oldPath}`);
    this.files.delete(from);
    this.files.set(to, { content: f.content, mtimeMs: this.clock++ });
  }

  async exists(path: string): Promise<boolean> {
    const n = normalize(path);
    if (this.files.has(n) || this.explicitDirs.has(n)) return true;
    // Implicit directory: any file under it.
    const prefix = n + '/';
    for (const k of this.files.keys()) if (k.startsWith(prefix)) return true;
    return false;
  }

  async stat(path: string): Promise<FileStat> {
    const n = normalize(path);
    const f = this.files.get(n);
    if (f) return { mtimeMs: f.mtimeMs, size: f.content.length, isDirectory: false };
    if (await this.exists(n)) return { mtimeMs: 0, size: 0, isDirectory: true };
    throw new Error(`ENOENT: no such file or directory: ${path}`);
  }

  async readDir(path: string): Promise<FileEntry[]> {
    const dir = normalize(path);
    const prefix = dir === '/' ? '/' : dir + '/';
    const names = new Map<string, boolean>(); // name → isDirectory
    const consider = (full: string) => {
      if (!full.startsWith(prefix)) return;
      const rest = full.slice(prefix.length);
      if (rest === '') return;
      const slash = rest.indexOf('/');
      if (slash === -1) names.set(rest, false);
      else names.set(rest.slice(0, slash), true);
    };
    for (const k of this.files.keys()) consider(k);
    for (const d of this.explicitDirs) consider(d);
    return [...names.entries()].map(([name, isDirectory]) => ({
      name,
      path: (prefix + name).replace(/\/+/g, '/'),
      isDirectory,
    }));
  }

  async createDir(path: string): Promise<void> {
    this.explicitDirs.add(normalize(path));
  }

  async deleteDir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const dir = normalize(path);
    const prefix = dir + '/';
    const children = [...this.files.keys()].filter((k) => k.startsWith(prefix));
    if (children.length > 0 && !options?.recursive) {
      throw new Error(`ENOTEMPTY: directory not empty: ${path}`);
    }
    for (const k of children) this.files.delete(k);
    this.explicitDirs.delete(dir);
  }

  async readFiles(paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const p of paths) out.set(p, await this.readFile(p));
    return out;
  }

  async writeFiles(files: Map<string, string>): Promise<void> {
    for (const [p, c] of files) await this.writeFile(p, c);
  }

  watch(): Disposable {
    return { dispose: () => undefined };
  }
}
