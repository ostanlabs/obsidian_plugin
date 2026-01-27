/**
 * Mock Test Adapter
 * 
 * In-memory implementation for CI/Jest testing.
 * Uses a Map-based filesystem and simulates plugin commands.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TestAdapter,
  CanvasData,
  CanvasNode,
  CanvasEdge,
} from './adapter';
import {
  EntityFixture,
  CanvasFixture,
  Expectation,
  ExpectationResult,
  TestRunResult,
  TIMING,
} from './types';
import { parseRawFrontmatter, createWithFrontmatter } from '../../util/frontmatter';
import { generateId } from '../../util/idGenerator';

// ============================================================================
// Mock Adapter Implementation
// ============================================================================

export class MockAdapter implements TestAdapter {
  readonly name = 'MockAdapter';
  
  /** In-memory filesystem: path -> content */
  private files: Map<string, string> = new Map();
  
  /** Path to fixtures folder */
  private fixturesPath: string;
  
  /** Workspace root for relative paths */
  private workspaceRoot = '_test_workspace';
  
  constructor(fixturesPath?: string) {
    this.fixturesPath = fixturesPath || path.join(__dirname, '..', 'fixtures');
  }
  
  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------
  
  async initialize(): Promise<void> {
    this.files.clear();
  }
  
  async cleanup(): Promise<void> {
    this.files.clear();
  }
  
  async reset(): Promise<void> {
    this.files.clear();
  }
  
  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------
  
  async createFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    this.files.set(normalizedPath, content);
  }
  
  async readFile(filePath: string): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);
    const content = this.files.get(normalizedPath);
    if (content === undefined) {
      throw new Error(`File not found: ${normalizedPath}`);
    }
    return content;
  }
  
  async updateFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    if (!this.files.has(normalizedPath)) {
      throw new Error(`File not found: ${normalizedPath}`);
    }
    this.files.set(normalizedPath, content);
  }
  
  async deleteFile(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    this.files.delete(normalizedPath);
  }
  
  async fileExists(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(filePath);
    return this.files.has(normalizedPath);
  }
  
  async createFolder(folderPath: string): Promise<void> {
    // In-memory FS doesn't need explicit folder creation
    // Folders are implicit from file paths
  }
  
  async listFiles(folderPath: string): Promise<string[]> {
    const normalizedFolder = this.normalizePath(folderPath);
    const files: string[] = [];
    
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(normalizedFolder + '/')) {
        files.push(filePath);
      }
    }
    
    return files;
  }
  
  // --------------------------------------------------------------------------
  // Canvas Operations
  // --------------------------------------------------------------------------
  
  async getCanvasData(canvasPath: string): Promise<CanvasData> {
    const content = await this.readFile(canvasPath);
    return JSON.parse(content) as CanvasData;
  }
  
  async updateCanvasData(canvasPath: string, data: CanvasData): Promise<void> {
    await this.updateFile(canvasPath, JSON.stringify(data, null, 2));
  }
  
  async findNodeByEntityId(canvasPath: string, entityId: string): Promise<CanvasNode | null> {
    const canvasData = await this.getCanvasData(canvasPath);
    
    for (const node of canvasData.nodes) {
      if (node.type === 'file' && node.file) {
        try {
          const content = await this.readFile(node.file);
          const fm = parseRawFrontmatter(content);
          if (fm && fm.id === entityId) {
            return node;
          }
        } catch {
          // File doesn't exist, skip
        }
      }
    }
    
    return null;
  }
  
  // --------------------------------------------------------------------------
  // Command Execution
  // --------------------------------------------------------------------------
  
  async executeCommand(commandId: string, input?: Record<string, unknown>): Promise<void> {
    // Mock command execution - simulate what the plugin would do
    // This is where we'd call the actual plugin logic with mocked dependencies
    
    switch (commandId) {
      case 'create-structured-item':
        await this.mockCreateStructuredItem(input);
        break;
      // Add more command handlers as needed
      default:
        console.warn(`MockAdapter: Unknown command ${commandId}`);
    }
  }

