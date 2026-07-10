module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/tests"],
	testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
	// tests/entity-core/* are vitest suites (import from 'vitest') — jest can't run them.
	testPathIgnorePatterns: ["/node_modules/", "/tests/integration/", "/tests/entity-core/", "/tests/mcp/"],
	// Source uses ESM ".js" import specifiers that resolve to ".ts" — strip the extension
	// so ts-jest resolves the TypeScript source.
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	transform: {
		"^.+\\.ts$": "ts-jest",
	},
	collectCoverageFrom: [
		"**/*.ts",
		"!**/*.d.ts",
		"!**/node_modules/**",
		"!**/dist/**",
		"!**/tests/**",
	],
	moduleFileExtensions: ["ts", "js", "json"],
};

