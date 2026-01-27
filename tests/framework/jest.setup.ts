/**
 * Jest Setup for Integration Tests
 * 
 * Configures the MockAdapter for CI testing.
 */

import { MockAdapter } from './mockAdapter';
import { setTestAdapter } from './adapter';

// Initialize mock adapter before all tests
beforeAll(async () => {
  const adapter = new MockAdapter();
  setTestAdapter(adapter);
  await adapter.initialize();
});

// Clean up after all tests
afterAll(async () => {
  const { getTestAdapter, hasTestAdapter } = await import('./adapter');
  if (hasTestAdapter()) {
    await getTestAdapter().cleanup();
  }
});

