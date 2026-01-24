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

  // --------------------------------------------------------------------------
  // Command Execution
  // --------------------------------------------------------------------------

  async executeCommand(commandId: string, input?: Record<string, unknown>): Promise<void> {
    // Store input for modal auto-fill
    if (input) {
      (this.plugin as any)._testInput = input;
    }

    // Execute the command
    await (this.app as any).commands.executeCommandById(
      `canvas-project-manager:${commandId}`
    );

    // Clear test input
    (this.plugin as any)._testInput = undefined;
  }

  // --------------------------------------------------------------------------
  // Fixture Setup (stub - delegates to MockAdapter logic)
  // --------------------------------------------------------------------------

  async createEntity(fixture: EntityFixture): Promise<string> {
    // TODO: Implement entity creation
    throw new Error('Not implemented - use MockAdapter for CI testing');
  }

  async createCanvas(fixture: CanvasFixture): Promise<void> {
    const canvasData: CanvasData = {
      nodes: fixture.nodes?.map(n => ({
        id: n.id,
        type: n.type,
        file: n.file,
        text: n.text,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        color: n.color,
      })) || [],
      edges: fixture.edges?.map(e => ({
        id: e.id,
        fromNode: e.fromNode,
        toNode: e.toNode,
        fromSide: e.fromSide,
        toSide: e.toSide,
        label: e.label,
      })) || [],
    };

    await this.createFile(fixture.name, JSON.stringify(canvasData, null, 2));
  }

  async copyFixture(fixtureName: string): Promise<void> {
    // TODO: Copy from plugin's fixtures folder
    throw new Error('Not implemented - use MockAdapter for CI testing');
  }

  // --------------------------------------------------------------------------
  // Verification (stub)
  // --------------------------------------------------------------------------

  async verifyExpectation(expectation: Expectation): Promise<ExpectationResult> {
    // TODO: Implement verification
    throw new Error('Not implemented - use MockAdapter for CI testing');
  }

  // --------------------------------------------------------------------------
  // Results Reporting
  // --------------------------------------------------------------------------

  async reportResults(results: TestRunResult): Promise<void> {
    // Show results in a modal
    // TODO: Create TestResultsModal component
    console.log('Test Results:', JSON.stringify(results, null, 2));

    // Also write to file for persistence
    const outputPath = '_test_workspace/test-results.json';
    await this.createFile(outputPath, JSON.stringify(results, null, 2));
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private resolvePath(path: string): string {
    // Prefix with test workspace
    if (path.startsWith('_test_workspace/')) {
      return path;
    }
    return `_test_workspace/${path}`;
  }

  private async ensureParentFolder(filePath: string): Promise<void> {
    const parts = filePath.split('/');
    parts.pop(); // Remove filename

    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!await this.app.vault.adapter.exists(currentPath)) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }

  private async deleteFolder(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (folder) {
      await this.app.vault.delete(folder, true);
    }
  }
}

