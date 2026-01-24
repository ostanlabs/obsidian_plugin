/**
 * Integration Tests - Scenario Runner
 *
 * Runs test scenarios using the MockAdapter.
 * This file is executed by Jest in CI.
 */

import { ScenarioRunner, getTestAdapter, MockAdapter } from '../framework';
// Import all suites
import onboardingSuite from '../scenarios/suites/onboarding.suite';
import entityCreationSuite from '../scenarios/suites/entity-creation.suite';
import hierarchySuite from '../scenarios/suites/hierarchy.suite';
import dependencyManagementSuite from '../scenarios/suites/dependency-management.suite';
import canvasOperationsSuite from '../scenarios/suites/canvas-operations.suite';
import archiveSystemSuite from '../scenarios/suites/archive-system.suite';
import navigationSuite from '../scenarios/suites/navigation.suite';
import notionSyncSuite from '../scenarios/suites/notion-sync.suite';
import edgeCasesSuite from '../scenarios/suites/edge-cases.suite';
import statusTransitionsSuite from '../scenarios/suites/status-transitions.suite';
import workstreamSuite from '../scenarios/suites/workstream.suite';

function logFailedScenarios(result: any) {
  for (const scenario of result.scenarios) {
    if (!scenario.passed) {
      console.log(`\nFAILED: ${scenario.scenario.id} - ${scenario.scenario.name}`);
      if (scenario.error) {
        console.log(`  Error: ${scenario.error}`);
      }
      for (const exp of scenario.results) {
        if (!exp.passed) {
          console.log(`  - ${exp.expectation.check}: ${exp.error || 'Failed'}`);
          if ((exp.expectation as any).path) {
            console.log(`    Path: ${(exp.expectation as any).path}`);
          }
          if ((exp.expectation as any).field) {
            console.log(`    Field: ${(exp.expectation as any).field}`);
          }
          console.log(`    Expected: ${JSON.stringify((exp.expectation as any).expected)}`);
          console.log(`    Actual: ${JSON.stringify(exp.actual)}`);
        }
      }
    }
  }
}

describe('Integration Tests', () => {
  let runner: ScenarioRunner;
  let adapter: MockAdapter;

  beforeAll(async () => {
    adapter = getTestAdapter() as MockAdapter;
    runner = new ScenarioRunner(adapter);
    await adapter.initialize();
  });

  afterAll(async () => {
    await adapter.cleanup();
  });

  describe('Onboarding Suite', () => {
    it('should run all onboarding scenarios', async () => {
      const result = await runner.runSuite(onboardingSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Entity Creation Suite', () => {
    it('should run all entity creation scenarios', async () => {
      const result = await runner.runSuite(entityCreationSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Hierarchy Suite', () => {
    it('should run all hierarchy scenarios', async () => {
      const result = await runner.runSuite(hierarchySuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Dependency Management Suite', () => {
    it('should run all dependency management scenarios', async () => {
      const result = await runner.runSuite(dependencyManagementSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Canvas Operations Suite', () => {
    it('should run all canvas operations scenarios', async () => {
      const result = await runner.runSuite(canvasOperationsSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Archive System Suite', () => {
    it('should run all archive system scenarios', async () => {
      const result = await runner.runSuite(archiveSystemSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Navigation Suite', () => {
    it('should run all navigation scenarios', async () => {
      const result = await runner.runSuite(navigationSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Notion Sync Suite', () => {
    it('should run all notion sync scenarios', async () => {
      const result = await runner.runSuite(notionSyncSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Edge Cases Suite', () => {
    it('should run all edge case scenarios', async () => {
      const result = await runner.runSuite(edgeCasesSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Status Transitions Suite', () => {
    it('should run all status transitions scenarios', async () => {
      const result = await runner.runSuite(statusTransitionsSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });

  describe('Workstream Suite', () => {
    it('should run all workstream scenarios', async () => {
      const result = await runner.runSuite(workstreamSuite);
      logFailedScenarios(result);
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });
});

