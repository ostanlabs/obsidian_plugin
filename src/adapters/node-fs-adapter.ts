/**
 * NodeFsAdapter — FileSystem implementation for MCP server mode using Node.js fs/promises.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileSystem } from '../entity-core/types.js';

export class NodeFsAdapter implements FileSystem {
  constructor(private readonly vaultPath: string) {}

  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.unlink(fullPath);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const fullOldPath = this.resolvePath(oldPath);
    const fullNewPath = this.resolvePath(newPath);
    await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
    await fs.rename(fullOldPath, fullNewPath);
  }

  async listFiles(folderPath: string): Promise<string[]> {
    const fullPath = this.resolvePath(folderPath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(folderPath, entry.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async createFolder(folderPath: string): Promise<void> {
    const fullPath = this.resolvePath(folderPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  async deleteFolder(folderPath: string): Promise<void> {
    const fullPath = this.resolvePath(folderPath);
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  private resolvePath(relativePath: string): string {
    // Remove leading slash if present (vault paths are relative)
    const cleaned = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return path.join(this.vaultPath, cleaned);
  }
}

