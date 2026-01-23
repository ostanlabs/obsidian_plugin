/**
 * Test Adapter Interface
 * 
 * Defines the contract for test execution adapters.
 * Implementations:
 * - MockAdapter: In-memory filesystem for CI/Jest
 * - ObsidianAdapter: Real Obsidian API for live testing
 */

import {
  EntityFixture,
  CanvasFixture,
  TestStep,
  Expectation,
  ExpectationResult,
  ScenarioResult,
  TestRunResult,
} from './types';

// ============================================================================
// Canvas Data Types (matching util/canvas.ts)
// ============================================================================

export interface CanvasNode {
  id: string;
  type: 'file' | 'text' | 'group' | 'link';
  file?: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  label?: string;
  color?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ============================================================================
// Test Adapter Interface
// ============================================================================

export interface TestAdapter {
  /** Adapter name for logging */
  readonly name: string;
  
  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------
  
  /** Initialize the adapter (called once before all tests) */
  initialize(): Promise<void>;
  
  /** Clean up (called once after all tests) */
  cleanup(): Promise<void>;
  
  /** Reset to clean state (called between test suites) */
  reset(): Promise<void>;
  
  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------
  
  /** Create a file with content */
  createFile(path: string, content: string): Promise<void>;
  
  /** Read file content */
  readFile(path: string): Promise<string>;
  
  /** Update file content */
  updateFile(path: string, content: string): Promise<void>;
  
  /** Delete a file */
  deleteFile(path: string): Promise<void>;
  
  /** Check if file exists */
  fileExists(path: string): Promise<boolean>;
  
  /** Create a folder (and parents if needed) */
  createFolder(path: string): Promise<void>;
  
  /** List files in a folder */
  listFiles(folderPath: string): Promise<string[]>;
  
  // --------------------------------------------------------------------------
  // Canvas Operations
  // --------------------------------------------------------------------------
  
  /** Get canvas data */
  getCanvasData(path: string): Promise<CanvasData>;
  
  /** Update canvas data */
  updateCanvasData(path: string, data: CanvasData): Promise<void>;
  
  /** Find node by entity ID (searches file nodes for matching frontmatter) */
  findNodeByEntityId(canvasPath: string, entityId: string): Promise<CanvasNode | null>;
  
  // --------------------------------------------------------------------------
  // Command Execution
  // --------------------------------------------------------------------------
  
  /** Execute a plugin command with optional input */
  executeCommand(commandId: string, input?: Record<string, unknown>): Promise<void>;
  
  // --------------------------------------------------------------------------
  // Fixture Setup
  // --------------------------------------------------------------------------
  
  /** Create an entity from fixture */
  createEntity(fixture: EntityFixture): Promise<string>;
  
  /** Create a canvas from fixture */
  createCanvas(fixture: CanvasFixture): Promise<void>;
  
  /** Copy a fixture folder to the workspace */
  copyFixture(fixtureName: string): Promise<void>;
  
  // --------------------------------------------------------------------------
  // Verification
  // --------------------------------------------------------------------------
  
  /** Verify a single expectation */
  verifyExpectation(expectation: Expectation): Promise<ExpectationResult>;
  
  // --------------------------------------------------------------------------
  // Results Reporting
  // --------------------------------------------------------------------------
  
  /** Report test results (UI modal or JSON file) */
  reportResults(results: TestRunResult): Promise<void>;
}

// ============================================================================
// Global Adapter Instance
// ============================================================================

let currentAdapter: TestAdapter | null = null;

export function setTestAdapter(adapter: TestAdapter): void {
  currentAdapter = adapter;
}

export function getTestAdapter(): TestAdapter {
  if (!currentAdapter) {
    throw new Error('Test adapter not initialized. Call setTestAdapter() first.');
  }
  return currentAdapter;
}

export function hasTestAdapter(): boolean {
  return currentAdapter !== null;
}

