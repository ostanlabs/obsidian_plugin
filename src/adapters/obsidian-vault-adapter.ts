/**
 * ObsidianVaultAdapter — FileSystem implementation for plugin mode using Obsidian Vault API.
 */

import type { Vault, TFolder, TFile } from 'obsidian';
import type { FileSystem } from '../entity-core/types.js';

export class ObsidianVaultAdapter implements FileSystem {
  constructor(private readonly vault: Vault) {}

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
      await this.vault.delete(file);
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
      await this.vault.delete(folder, true); // recursive
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

