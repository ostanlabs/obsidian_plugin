/**
 * Scenario Test Runner
 * 
 * Executes test scenarios against the configured adapter.
 * Handles precondition setup, step execution, and expectation verification.
 */

import {
  TestScenario,
  TestSuite,
  TestStep,
  ScenarioResult,
  SuiteResult,
  TestRunResult,
  ExpectationResult,
  TIMING,
} from './types';
import { TestAdapter, getTestAdapter } from './adapter';

// ============================================================================
// Scenario Runner
// ============================================================================

export class ScenarioRunner {
  private adapter: TestAdapter;
  
  constructor(adapter?: TestAdapter) {
    this.adapter = adapter || getTestAdapter();
  }
  
  // --------------------------------------------------------------------------
  // Run Methods
  // --------------------------------------------------------------------------
  
  /**
   * Run a single scenario
   */
  async runScenario(scenario: TestScenario): Promise<ScenarioResult> {
    const startTime = Date.now();
    const results: ExpectationResult[] = [];

    try {
      // Setup preconditions
      await this.setupPreconditions(scenario);

      // Execute steps
      for (const step of scenario.steps) {
        await this.executeStep(step);
      }

      // Verify expectations
      for (const expectation of scenario.expectations) {
        const result = await this.adapter.verifyExpectation(expectation);
        results.push(result);
      }

      const passed = results.every(r => r.passed);

      return {
        scenario,
        passed,
        results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        scenario,
        passed: false,
        results,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Run a test suite (multiple scenarios)
   * By default, resets adapter between each scenario for isolation.
   * Set resetBetweenScenarios: false to share state between scenarios.
   */
  async runSuite(suite: TestSuite): Promise<SuiteResult> {
    const startTime = Date.now();
    const scenarioResults: ScenarioResult[] = [];
    const resetBetween = suite.resetBetweenScenarios !== false; // Default to true

    // Initial reset and copy fixture
    await this.adapter.reset();
    if (suite.fixture) {
      await this.adapter.copyFixture(suite.fixture);
    }

    // Run scenarios
    for (const scenario of suite.scenarios) {
      // Reset between scenarios if configured (default: true)
      if (resetBetween && scenarioResults.length > 0) {
        await this.adapter.reset();
        if (suite.fixture) {
          await this.adapter.copyFixture(suite.fixture);
        }
      }

      const result = await this.runScenario(scenario);
      scenarioResults.push(result);
    }

    const passed = scenarioResults.filter(r => r.passed).length;
    const failed = scenarioResults.filter(r => !r.passed).length;

    return {
      name: suite.name,
      fixture: suite.fixture,
      scenarios: scenarioResults,
      passed,
      failed,
      duration: Date.now() - startTime,
    };
  }
  
  /**
   * Run multiple suites
   */
  async runSuites(suites: TestSuite[]): Promise<TestRunResult> {
    await this.adapter.initialize();
    
    const suiteResults: SuiteResult[] = [];
    
    for (const suite of suites) {
      const result = await this.runSuite(suite);
      suiteResults.push(result);
    }
    
    await this.adapter.cleanup();
    
    const total = suiteResults.reduce((sum, s) => sum + s.scenarios.length, 0);
    const passed = suiteResults.reduce((sum, s) => sum + s.passed, 0);
    const failed = suiteResults.reduce((sum, s) => sum + s.failed, 0);
    
    const result: TestRunResult = {
      timestamp: new Date().toISOString(),
      suites: suiteResults,
      summary: {
        total,
        passed,
        failed,
        skipped: 0,
      },
    };
    
    await this.adapter.reportResults(result);
    
    return result;
  }
  
  // --------------------------------------------------------------------------
  // Setup & Execution
  // --------------------------------------------------------------------------
  
  private async setupPreconditions(scenario: TestScenario): Promise<void> {
    const { preconditions } = scenario;

    // Create folders
    if (preconditions.folders) {
      for (const folder of preconditions.folders) {
        await this.adapter.createFolder(folder);
      }
    }

    // Create entities
    if (preconditions.entities) {
      for (const entity of preconditions.entities) {
        await this.adapter.createEntity(entity);
      }
    }

    // Create canvas
    if (preconditions.canvas) {
      // Default canvas name to 'project.canvas' if not specified
      const canvasFixture = {
        name: preconditions.canvas.name || 'project.canvas',
        nodes: preconditions.canvas.nodes || [],
        edges: preconditions.canvas.edges || [],
      };
      await this.adapter.createCanvas(canvasFixture);
    }

    // Create raw files (for migration scenarios, etc.)
    if (preconditions.files) {
      for (const file of preconditions.files) {
        await this.adapter.createFile(file.path, file.content);
      }
    }
  }

  private async executeStep(step: TestStep): Promise<void> {
    switch (step.action) {
      case 'command':
        await this.adapter.executeCommand(step.command, step.input);
        await this.wait(TIMING.fileSystemSettle);
        break;

      case 'create-file':
        await this.adapter.createFile(step.path, step.content);
        await this.wait(TIMING.fileSystemSettle);
        break;

      case 'edit-file':
        await this.executeEditFile(step);
        await this.wait(TIMING.fileSystemSettle);
        break;

      case 'delete-file':
        await this.adapter.deleteFile(step.path);
        await this.wait(TIMING.fileSystemSettle);
        break;

      case 'wait':
        await this.wait(step.ms);
        break;

      default:
        throw new Error(`Unknown step action: ${(step as any).action}`);
    }
  }

  private async executeEditFile(step: { action: 'edit-file'; path: string; frontmatter?: Record<string, unknown>; body?: string }): Promise<void> {
    const content = await this.adapter.readFile(step.path);

    // Parse existing content
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    let existingFm: Record<string, unknown> = {};
    let body = content;

    if (fmMatch) {
      // Simple YAML parsing (for basic cases)
      const fmLines = fmMatch[1].split('\n');
      for (const line of fmLines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.substring(0, colonIdx).trim();
          let value: unknown = line.substring(colonIdx + 1).trim();

          // Handle arrays
          if (value === '') {
            // Could be a multi-line array, skip for now
          } else if (value === '[]') {
            value = [];
          } else {
            // Try to parse as JSON for complex values
            try {
              value = JSON.parse(value as string);
            } catch {
              // Keep as string
            }
          }

          existingFm[key] = value;
        }
      }
      body = fmMatch[2];
    }

    // Merge frontmatter updates
    if (step.frontmatter) {
      Object.assign(existingFm, step.frontmatter);
    }

    // Update body if provided
    if (step.body !== undefined) {
      body = step.body;
    }

    // Rebuild content - use JSON format for arrays (consistent with plugin)
    const fmYaml = Object.entries(existingFm)
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          return `${k}: ${JSON.stringify(v)}`;
        }
        if (typeof v === 'string') return `${k}: "${v}"`;
        return `${k}: ${JSON.stringify(v)}`;
      })
      .join('\n');

    const newContent = `---\n${fmYaml}\n---\n${body}`;
    await this.adapter.updateFile(step.path, newContent);

    // Auto-sync: if depends_on was updated, sync blocks on target entities
    if (step.frontmatter?.depends_on && existingFm.id) {
      const entityId = existingFm.id as string;
      const dependsOn = step.frontmatter.depends_on as string[];
      await this.syncBlocksField(entityId, dependsOn);
    }
  }

  /**
   * Sync the blocks field on target entities when depends_on changes
   * This mimics the plugin's auto-sync behavior
   */
  private async syncBlocksField(entityId: string, dependsOn: string[]): Promise<void> {
    const folders = ['milestones', 'stories', 'tasks', 'decisions', 'documents', 'features'];

    for (const targetId of dependsOn) {
      // Find the target entity file by searching all entity folders
      let found = false;
      for (const folder of folders) {
        if (found) break;
        try {
          const files = await this.adapter.listFiles(folder);
          for (const file of files) {
            if (!file.endsWith('.md')) continue;
            try {
              const content = await this.adapter.readFile(file);
              const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
              if (!fmMatch) continue;

              // Check if this file has the target ID
              const idMatch = fmMatch[1].match(/^id:\s*["']?([^"'\n]+)["']?/m);
              if (!idMatch || idMatch[1] !== targetId) continue;

              // Parse frontmatter
              const fm: Record<string, unknown> = {};
              const fmLines = fmMatch[1].split('\n');
              for (const line of fmLines) {
                const colonIdx = line.indexOf(':');
                if (colonIdx > 0) {
                  const key = line.substring(0, colonIdx).trim();
                  let value: unknown = line.substring(colonIdx + 1).trim();
                  if (value === '[]') value = [];
                  else {
                    try { value = JSON.parse(value as string); } catch { /* keep as string */ }
                  }
                  fm[key] = value;
                }
              }

              // Update blocks array
              const blocks = Array.isArray(fm.blocks) ? fm.blocks : [];
              if (!blocks.includes(entityId)) {
                blocks.push(entityId);
                fm.blocks = blocks;

                // Rebuild content
                const fmYaml = Object.entries(fm)
                  .map(([k, v]) => {
                    if (Array.isArray(v)) return `${k}: ${JSON.stringify(v)}`;
                    if (typeof v === 'string') return `${k}: "${v}"`;
                    return `${k}: ${JSON.stringify(v)}`;
                  })
                  .join('\n');

                const newContent = `---\n${fmYaml}\n---\n${fmMatch[2]}`;
                await this.adapter.updateFile(file, newContent);
              }
              found = true;
              break;
            } catch {
              // File not found or parse error, skip
            }
          }
        } catch {
          // Folder doesn't exist, skip
        }
      }
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Run scenarios with the default adapter
 */
export async function runScenarios(scenarios: TestScenario[]): Promise<TestRunResult> {
  const runner = new ScenarioRunner();
  const suite: TestSuite = {
    name: 'Ad-hoc Scenarios',
    fixture: '',
    scenarios,
  };
  return runner.runSuites([suite]);
}

/**
 * Run a single scenario with the default adapter
 */
export async function runSingleScenario(scenario: TestScenario): Promise<ScenarioResult> {
  const runner = new ScenarioRunner();
  return runner.runScenario(scenario);
}

