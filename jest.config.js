module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/tests"],
	testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
	testPathIgnorePatterns: ["/node_modules/", "/tests/integration/"],
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

