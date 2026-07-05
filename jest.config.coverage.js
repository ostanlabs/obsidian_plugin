// Coverage-only jest config (added for measurement; does not modify product/source).
// - Maps ESM ".js" import specifiers back to ".ts" so ts-jest can resolve them.
// - Excludes the vitest-based entity-core suite and integration suite.
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>"],
	testMatch: ["<rootDir>/tests/**/?(*.)+(spec|test).ts"],
	testPathIgnorePatterns: [
		"/node_modules/",
		"/tests/integration/",
		"/tests/entity-core/",
	],
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	transform: {
		"^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
	},
	collectCoverageFrom: [
		"util/**/*.ts",
		"src/**/*.ts",
		"main.ts",
		"mcp.ts",
		"settings.ts",
		"types.ts",
		"!**/*.d.ts",
	],
	moduleFileExtensions: ["ts", "js", "json"],
};
