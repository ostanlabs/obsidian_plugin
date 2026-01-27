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
  children?: string[];
  status?: ItemStatus;
  priority?: ItemPriority;
  depends_on?: string[];
  blocks?: string[];
  affects?: string[];
  implemented_by?: string[];
  documented_by?: string[];
  archived?: boolean;
  /** Additional frontmatter fields */
  extra?: Record<string, unknown>;
}

export interface CanvasFixture {
  /** Canvas file name (defaults to 'project.canvas') */
  name?: string;
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
  canvas?: CanvasFixture | null;
  /** Plugin settings overrides */
  settings?: Record<string, unknown>;
  /** Raw files to create (for migration scenarios, etc.) */
  files?: Array<{ path: string; content: string }>;
  /** Optional description of preconditions */
  description?: string;
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

export interface FileExistsExpectation {
  check: 'file-exists';
  path: string;
  expected: boolean;
}

export interface FrontmatterExpectation {
  check: 'frontmatter';
  path: string;
  field: string;
  expected: unknown;
  /** Optional: use 'contains' for array membership check */
  mode?: 'equals' | 'contains';
}

export interface CanvasNodeExpectation {
  check: 'canvas-node';
  canvas: string;
  /** Entity ID to find */
  entityId: string;
  expected: boolean;
}

export interface CanvasEdgeExpectation {
  check: 'canvas-edge';
  canvas: string;
  fromEntityId: string;
  toEntityId: string;
  expected: boolean;
}

export interface ArrayContainsExpectation {
  check: 'array-contains';
  path: string;
  field: string;
  value: string;
  expected: boolean;
}

export interface NodePositionExpectation {
  check: 'node-position';
  canvas: string;
  entityIdA: string;
  entityIdB: string;
  /** 'left-of' means A.x + A.width < B.x */
  relation: 'left-of' | 'right-of' | 'above' | 'below';
}

// ============================================================================
// Test Results
// ============================================================================

export interface ExpectationResult {
  expectation: Expectation;
  passed: boolean;
  actual?: unknown;
  error?: string;
}

export interface ScenarioResult {
  scenario: TestScenario;
  passed: boolean;
  results: ExpectationResult[];
  duration: number;
  error?: string;
}

export interface SuiteResult {
  name: string;
  fixture: string;
  scenarios: ScenarioResult[];
  passed: number;
  failed: number;
  duration: number;
}

export interface TestRunResult {
  timestamp: string;
  suites: SuiteResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

// ============================================================================
// Test Suite Definition
// ============================================================================

export interface TestSuite {
  name: string;
  /** Optional description */
  description?: string;
  /** Fixture folder to copy (relative to tests/fixtures/) - optional */
  fixture?: string;
  /** Scenarios to run in order */
  scenarios: TestScenario[];
  /** If true, reset adapter between each scenario (default: true) */
  resetBetweenScenarios?: boolean;
}

// ============================================================================
// Helper function type for defining scenarios
// ============================================================================

export function defineScenario(scenario: TestScenario): TestScenario {
  return scenario;
}

export function defineSuite(suite: TestSuite): TestSuite {
  return suite;
}

