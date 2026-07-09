/**
 * ObsidianVaultAdapter — FileSystem implementation for plugin mode using Obsidian Vault API.
 */

import { Vault, TFolder, TFile, FileManager } from 'obsidian';
import type { FileSystem, FileStat, FileEntry } from '../entity-core/types.js';

export class ObsidianVaultAdapter implements FileSystem {
  /**
   * When a FileManager is provided, deletions go through trashFile() so they
   * respect the user's "Deleted files" preference (system trash / .trash /
   * permanent) instead of always deleting permanently via Vault.delete().
   */
  constructor(
    private readonly vault: Vault,
    private readonly fileManager?: FileManager
  ) {}

  async readFile(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return await this.vault.read(file);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.modify(file, content);
    } else {
      // Create parent folders if needed
      const folderPath = path.substring(0, path.lastIndexOf('/'));
      if (folderPath) {
        await this.ensureFolder(folderPath);
      }
      await this.vault.create(path, content);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      if (this.fileManager) {
        await this.fileManager.trashFile(file);
      } else {
        await this.vault.delete(file);
      }
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(oldPath);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${oldPath}`);
    }
    
    // Ensure target folder exists
    const folderPath = newPath.substring(0, newPath.lastIndexOf('/'));
    if (folderPath) {
      await this.ensureFolder(folderPath);
    }
    
    await this.vault.rename(file, newPath);
  }

  async listFiles(folderPath: string): Promise<string[]> {
    const folder = this.vault.getAbstractFileByPath(folderPath);
    if (!folder || !(folder instanceof TFolder)) {
      return [];
    }

    const files: string[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile) {
        files.push(child.path);
      }
    }
    return files;
  }

  async exists(path: string): Promise<boolean> {
    const file = this.vault.getAbstractFileByPath(path);
    return file !== null;
  }

  async createFolder(path: string): Promise<void> {
    await this.ensureFolder(path);
  }

  async deleteFolder(path: string): Promise<void> {
    const folder = this.vault.getAbstractFileByPath(path);
    if (folder instanceof TFolder) {
      if (this.fileManager) {
        await this.fileManager.trashFile(folder); // trashes recursively
      } else {
        await this.vault.delete(folder, true); // recursive
      }
    }
  }

  async stat(path: string): Promise<FileStat> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    if (file instanceof TFile) {
      return {
        isDirectory: false,
        size: file.stat.size,
        mtimeMs: file.stat.mtime,
      };
    } else if (file instanceof TFolder) {
      return {
        isDirectory: true,
        size: 0,
        mtimeMs: 0,
      };
    }

    throw new Error(`Unknown file type: ${path}`);
  }

  async readDir(folderPath: string): Promise<FileEntry[]> {
    const folder = this.vault.getAbstractFileByPath(folderPath);
    if (!folder || !(folder instanceof TFolder)) {
      return [];
    }

    return folder.children.map((child) => ({
      name: child.name,
      path: child.path,
      isDirectory: child instanceof TFolder,
    }));
  }

  async createDir(path: string, _options?: { recursive?: boolean }): Promise<void> {
    await this.ensureFolder(path);
  }

  async deleteDir(path: string, _options?: { recursive?: boolean }): Promise<void> {
    await this.deleteFolder(path);
  }

  async readFiles(paths: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const filePath of paths) {
      try {
        const content = await this.readFile(filePath);
        result.set(filePath, content);
      } catch {
        // Skip files that can't be read
      }
    }
    return result;
  }

  async writeFiles(files: Map<string, string>): Promise<void> {
    for (const [filePath, content] of files) {
      await this.writeFile(filePath, content);
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) {
      return; // Already exists
    }

    // Obsidian's createFolder creates parent folders automatically
    try {
      await this.vault.createFolder(path);
    } catch (error) {
      // Folder might have been created by another operation
      const exists = this.vault.getAbstractFileByPath(path);
      if (!(exists instanceof TFolder)) {
        throw error;
      }
    }
  }
}

