/**
 * Test Framework Types
 * 
 * Core type definitions for the scenario-based test framework.
 * Supports both Live (Obsidian) and Mock (CI/Jest) execution modes.
 */

import { EntityType, ItemStatus, ItemPriority } from '../../types';

// ============================================================================
// Timing Configuration
// ============================================================================

export const TIMING = {
  fileSystemSettle: 800,    // After file create/modify
  canvasUpdate: 800,        // After canvas manipulation
  notionSync: 2000,         // External API (when not mocked)
} as const;

// ============================================================================
// Entity Fixtures
// ============================================================================

export interface EntityFixture {
  type: EntityType;
  id: string;
  title: string;
  workstream?: string;
  parent?: string;
  status?: ItemStatus;
  priority?: ItemPriority;
  depends_on?: string[];
  blocks?: string[];
  affects?: string[];
  implemented_by?: string[];
  documented_by?: string[];
  /** Additional frontmatter fields */
  extra?: Record<string, unknown>;
}

export interface CanvasFixture {
  name: string;
  nodes?: CanvasNodeFixture[];
  edges?: CanvasEdgeFixture[];
}

export interface CanvasNodeFixture {
  id: string;
  type: 'file' | 'text' | 'group';
  file?: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface CanvasEdgeFixture {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  label?: string;
}

// ============================================================================
// Test Scenario Definition
// ============================================================================

export interface TestScenario {
  /** Unique scenario ID (e.g., "SC-001", "EC-020") */
  id: string;
  /** Human-readable scenario name */
  name: string;
  /** Category for grouping (e.g., "entity-creation", "edge-case") */
  category: ScenarioCategory;
  /** Optional description */
  description?: string;
  
  /** Preconditions - state required before test */
  preconditions: ScenarioPreconditions;
  
  /** Steps to execute */
  steps: TestStep[];
  
  /** Expected results to verify */
  expectations: Expectation[];
}

export type ScenarioCategory = 
  | 'onboarding'
  | 'entity-creation'
  | 'hierarchy'
  | 'dependencies'
  | 'canvas-operations'
  | 'archive'
  | 'navigation'
  | 'notion-sync'
  | 'edge-case'
  | 'status-transition'
  | 'workstream';

export interface ScenarioPreconditions {
  /** Folders that must exist */
  folders?: string[];
  /** Entities to create before test */
  entities?: EntityFixture[];
  /** Canvas state */
  canvas?: CanvasFixture;
  /** Plugin settings overrides */
  settings?: Record<string, unknown>;
}

// ============================================================================
// Test Steps
// ============================================================================

export type TestStep = 
  | CommandStep
  | EditFileStep
  | DeleteFileStep
  | WaitStep
  | CreateFileStep;

export interface CommandStep {
  action: 'command';
  /** Plugin command ID (e.g., "create-structured-item") */
  command: string;
  /** Input to auto-fill into modals */
  input?: Record<string, unknown>;
}

export interface EditFileStep {
  action: 'edit-file';
  /** File path relative to vault */
  path: string;
  /** Frontmatter updates */
  frontmatter?: Record<string, unknown>;
  /** Body content to set */
  body?: string;
}

export interface DeleteFileStep {
  action: 'delete-file';
  path: string;
}

export interface CreateFileStep {
  action: 'create-file';
  path: string;
  content: string;
}

export interface WaitStep {
  action: 'wait';
  /** Milliseconds to wait */
  ms: number;
}

// ============================================================================
// Expectations
// ============================================================================

export type Expectation =
  | FileExistsExpectation
  | FrontmatterExpectation
  | CanvasNodeExpectation
  | CanvasEdgeExpectation
  | ArrayContainsExpectation
  | NodePositionExpectation;

