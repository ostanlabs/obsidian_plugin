/**
 * Integration Tests - Scenario Runner
 * 
 * Runs test scenarios using the MockAdapter.
 * This file is executed by Jest in CI.
 */

import { ScenarioRunner, getTestAdapter } from '../framework';
import entityCreationSuite from '../scenarios/suites/entity-creation.suite';
import edgeCasesSuite from '../scenarios/suites/edge-cases.suite';

describe('Integration Tests', () => {
  let runner: ScenarioRunner;
  
  beforeAll(() => {
    runner = new ScenarioRunner(getTestAdapter());
  });
  
  describe('Entity Creation Suite', () => {
    it('should run all entity creation scenarios', async () => {
      const result = await runner.runSuite(entityCreationSuite);
      
      // Log results for debugging
      for (const scenario of result.scenarios) {
        if (!scenario.passed) {
          console.log(`FAILED: ${scenario.scenario.id} - ${scenario.scenario.name}`);
          for (const exp of scenario.results) {
            if (!exp.passed) {
              console.log(`  - ${exp.expectation.check}: ${exp.error || 'Failed'}`);
              console.log(`    Expected: ${JSON.stringify((exp.expectation as any).expected)}`);
              console.log(`    Actual: ${JSON.stringify(exp.actual)}`);
            }
          }
        }
      }
      
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });
  
  describe('Edge Cases Suite', () => {
    it('should run all edge case scenarios', async () => {
      const result = await runner.runSuite(edgeCasesSuite);
      
      // Log results for debugging
      for (const scenario of result.scenarios) {
        if (!scenario.passed) {
          console.log(`FAILED: ${scenario.scenario.id} - ${scenario.scenario.name}`);
          for (const exp of scenario.results) {
            if (!exp.passed) {
              console.log(`  - ${exp.expectation.check}: ${exp.error || 'Failed'}`);
              console.log(`    Expected: ${JSON.stringify((exp.expectation as any).expected)}`);
              console.log(`    Actual: ${JSON.stringify(exp.actual)}`);
            }
          }
        }
      }
      
      expect(result.failed).toBe(0);
      expect(result.passed).toBe(result.scenarios.length);
    });
  });
});

