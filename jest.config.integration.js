/**
 * Jest Configuration for Integration Tests
 * 
 * Uses MockAdapter for CI/headless testing.
 * Run with: npm run test:integration
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Only run integration tests
  testMatch: [
    '<rootDir>/tests/integration/**/*.test.ts',
  ],
  
  // Setup file for MockAdapter
  setupFilesAfterEnv: [
    '<rootDir>/tests/framework/jest.setup.ts',
  ],
  
  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Transform TypeScript
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  
  // Coverage (optional)
  collectCoverageFrom: [
    'util/**/*.ts',
    '!util/**/*.d.ts',
  ],
  
  // Timeout for async operations
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
};

