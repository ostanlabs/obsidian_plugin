module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/tests"],
	testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
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

