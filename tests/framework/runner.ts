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
   * Run a test suite (multiple scenarios with shared fixture)
   */
  async runSuite(suite: TestSuite): Promise<SuiteResult> {
    const startTime = Date.now();
    const scenarioResults: ScenarioResult[] = [];
    
    // Reset and copy fixture
    await this.adapter.reset();
    if (suite.fixture) {
      await this.adapter.copyFixture(suite.fixture);
    }
    
    // Run scenarios in order (shared state)
    for (const scenario of suite.scenarios) {
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
      await this.adapter.createCanvas(preconditions.canvas);
    }
  }

