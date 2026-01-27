/**
 * Obsidian Test Adapter (Stub)
 * 
 * Live implementation for running tests inside Obsidian.
 * This adapter uses the real Obsidian API and runs against an actual vault.
 * 
 * To be completed when integrating with the plugin's test runner command.
 */

import {
  TestAdapter,
  CanvasData,
  CanvasNode,
} from './adapter';
import {
  EntityFixture,
  CanvasFixture,
  Expectation,
  ExpectationResult,
  TestRunResult,
} from './types';

// Type imports for Obsidian (will be available when running in plugin context)
// import { App, TFile, TFolder, Vault } from 'obsidian';

/**
 * Obsidian Adapter - Live Testing
 * 
 * This adapter is used when running tests inside Obsidian.
 * It uses the real Obsidian API to interact with the vault.
 * 
 * Usage:
 * ```typescript
 * // In plugin's main.ts
 * import { ObsidianAdapter, setTestAdapter } from './tests/framework';
 * 
 * this.addCommand({
 *   id: 'run-tests',
 *   name: 'Run Integration Tests',
 *   callback: async () => {
 *     const adapter = new ObsidianAdapter(this.app, this);
 *     setTestAdapter(adapter);
 *     const runner = new ScenarioRunner();
 *     const results = await runner.runSuites([...suites]);
 *   }
 * });
 * ```
 */
export class ObsidianAdapter implements TestAdapter {
  readonly name = 'ObsidianAdapter';
  
  // These will be set when running in Obsidian context
  private app: any; // App
  private plugin: any; // CanvasStructuredItemsPlugin
  
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }
  
  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------
  
  async initialize(): Promise<void> {
    // Ensure test workspace folder exists
    const testFolder = '_test_workspace';
    if (!await this.app.vault.adapter.exists(testFolder)) {
      await this.app.vault.createFolder(testFolder);
    }
  }
  
  async cleanup(): Promise<void> {
    // Optionally clean up test workspace
    // await this.deleteFolder('_test_workspace');
  }
  
  async reset(): Promise<void> {
    // Delete and recreate test workspace
    const testFolder = '_test_workspace';
    if (await this.app.vault.adapter.exists(testFolder)) {
      await this.deleteFolder(testFolder);
    }
    await this.app.vault.createFolder(testFolder);
  }
  
  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------
  
  async createFile(path: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await this.ensureParentFolder(fullPath);
    await this.app.vault.create(fullPath, content);
  }
  
  async readFile(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    const file = this.app.vault.getAbstractFileByPath(fullPath);
    if (!file) throw new Error(`File not found: ${fullPath}`);
    return await this.app.vault.read(file);
  }
  
  async updateFile(path: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    const file = this.app.vault.getAbstractFileByPath(fullPath);
    if (!file) throw new Error(`File not found: ${fullPath}`);
    await this.app.vault.modify(file, content);
  }
  
  async deleteFile(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    const file = this.app.vault.getAbstractFileByPath(fullPath);
    if (file) {
      await this.app.vault.delete(file);
    }
  }
  
  async fileExists(path: string): Promise<boolean> {
    const fullPath = this.resolvePath(path);
    return await this.app.vault.adapter.exists(fullPath);
  }
  
  async createFolder(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (!await this.app.vault.adapter.exists(fullPath)) {
      await this.app.vault.createFolder(fullPath);
    }
  }
  
  async listFiles(folderPath: string): Promise<string[]> {
    const fullPath = this.resolvePath(folderPath);
    const folder = this.app.vault.getAbstractFileByPath(fullPath);
    if (!folder || !('children' in folder)) return [];
    
    return folder.children
      .filter((f: any) => f.extension === 'md')
      .map((f: any) => f.path);
  }
  
  // --------------------------------------------------------------------------
  // Canvas Operations (stub - to be implemented)
  // --------------------------------------------------------------------------
  
  async getCanvasData(path: string): Promise<CanvasData> {
    const content = await this.readFile(path);
    return JSON.parse(content);
  }
  
  async updateCanvasData(path: string, data: CanvasData): Promise<void> {
    await this.updateFile(path, JSON.stringify(data, null, 2));
  }
  
  async findNodeByEntityId(canvasPath: string, entityId: string): Promise<CanvasNode | null> {
    // TODO: Implement using real canvas parsing
    throw new Error('Not implemented - use MockAdapter for CI testing');
  }

