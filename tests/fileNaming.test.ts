// fileNaming.ts imports { App, normalizePath } from "obsidian". App is a type
// (elided at runtime) but normalizePath is a runtime value, so we provide a
// virtual mock of the obsidian module.
jest.mock(
	"obsidian",
	() => ({
		normalizePath: (p: string) =>
			p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, ""),
	}),
	{ virtual: true }
);

import {
	toSnakeCase,
	sanitizeFilename,
	generateEntityFilename,
	generateUniqueFilename,
	isPluginCreatedNote,
} from "../util/fileNaming";
import { PathResolver } from "../src/entity-core/path-resolver";
import { SchemaRegistry } from "../src/entity-core/schema-registry";
import { DEFAULT_SCHEMA } from "../src/entity-core/default-schema";

describe("fileNaming", () => {
	describe("toSnakeCase", () => {
		it("lowercases and joins words with underscores", () => {
			expect(toSnakeCase("Hello World")).toBe("hello_world");
		});
		it("strips special characters", () => {
			expect(toSnakeCase("Hello, World!")).toBe("hello_world");
		});
		it("converts hyphens to underscores and collapses repeats", () => {
			expect(toSnakeCase("a--b  c")).toBe("a_b_c");
		});
		it("trims leading/trailing underscores", () => {
			expect(toSnakeCase("  !leading! ")).toBe("leading");
		});
		it("returns empty string for all-special input", () => {
			expect(toSnakeCase("!!!")).toBe("");
		});
	});

	describe("sanitizeFilename", () => {
		it("replaces invalid path chars with a hyphen", () => {
			expect(sanitizeFilename('a/b:c*d?e"f<g>h|i')).toBe("a-b-c-d-e-f-g-h-i");
		});
		it("collapses multiple hyphens and trims them", () => {
			expect(sanitizeFilename("--a///b--")).toBe("a-b");
		});
		it("preserves whitespace and normal punctuation", () => {
			expect(sanitizeFilename("My Note (v2)")).toBe("My Note (v2)");
		});
	});

	describe("generateEntityFilename", () => {
		// Canonical convention (production vault): TITLE-ONLY (no id prefix),
		// PRESERVE-case slug (spaces→_, hyphens kept, case preserved).
		it("produces a title-only, preserve-case filename (no id prefix)", () => {
			expect(generateEntityFilename("M-001", "Kickoff Plan")).toBe(
				"Kickoff_Plan.md"
			);
		});
		it("keeps hyphens and case, replacing spaces/invalid chars with _", () => {
			expect(generateEntityFilename("T-1", "Add 90-day retention policy")).toBe(
				"Add_90-day_retention_policy.md"
			);
		});
		it("sanitizes filesystem-invalid characters", () => {
			expect(generateEntityFilename("T-9", "a/b:c")).toBe("a_b_c.md");
			expect(generateEntityFilename("F-1", "OAuth 2.0 / SSO!")).toBe("OAuth_2_0_SSO.md");
		});
		it("does not truncate (parity with MCP path-resolver)", () => {
			const longTitle = "x".repeat(200);
			expect(generateEntityFilename("S-1", longTitle)).toBe(`${"x".repeat(200)}.md`);
		});
	});

	// Cross-engine parity: the plugin's generateEntityFilename MUST equal the MCP
	// PathResolver.generateFilename for the same input (single source of truth).
	describe("plugin ↔ MCP filename parity", () => {
		const resolver = new PathResolver(new SchemaRegistry(DEFAULT_SCHEMA), {
			vaultPath: "/vault",
			entitiesFolder: "",
			archiveFolder: "archive",
			canvasFolder: "projects",
		});
		it.each([
			["M-001", "Kickoff Plan"],
			["T-1", "Add 90-day retention policy"],
			["DEC-2", "Use Postgres: ADR #1"],
			["F-1", "OAuth 2.0 / SSO!"],
			["S-9", "API Versioning Strategy"],
		])("generateEntityFilename == PathResolver.generateFilename (%s, %s)", (id, title) => {
			expect(generateEntityFilename(id, title)).toBe(
				resolver.generateFilename(id, title)
			);
		});
	});

	describe("generateUniqueFilename", () => {
		const makeApp = (existing: string[]) => {
			const set = new Set(existing);
			return {
				vault: {
					getAbstractFileByPath: (p: string) => (set.has(p) ? {} : null),
				},
			} as any;
		};

		it("returns the base path when nothing exists", () => {
			const app = makeApp([]);
			expect(generateUniqueFilename(app, "notes", "My Note", "md")).toBe(
				"notes/My Note.md"
			);
		});

		it("adds an index suffix when the file already exists", () => {
			const app = makeApp(["notes/My Note.md"]);
			expect(generateUniqueFilename(app, "notes", "My Note", "md")).toBe(
				"notes/My Note-1.md"
			);
		});

		it("increments the suffix until a free name is found", () => {
			const app = makeApp([
				"notes/My Note.md",
				"notes/My Note-1.md",
				"notes/My Note-2.md",
			]);
			expect(generateUniqueFilename(app, "notes", "My Note", "md")).toBe(
				"notes/My Note-3.md"
			);
		});

		it("works with an empty folder path (vault root)", () => {
			const app = makeApp([]);
			expect(generateUniqueFilename(app, "", "Root Note", "md")).toBe(
				"Root Note.md"
			);
		});
	});

	describe("isPluginCreatedNote", () => {
		const base = {
			type: "task",
			id: "T-001",
			canvas_source: "board.canvas",
		};
		it("returns true for a complete valid entity", () => {
			expect(isPluginCreatedNote(base as any)).toBe(true);
		});
		it("returns false when frontmatter is undefined", () => {
			expect(isPluginCreatedNote(undefined)).toBe(false);
		});
		it("returns false when canvas_source is missing", () => {
			expect(isPluginCreatedNote({ type: "task", id: "T-1" } as any)).toBe(false);
		});
		it("returns false for an unknown entity type", () => {
			expect(
				isPluginCreatedNote({ ...base, type: "note" } as any)
			).toBe(false);
		});
		it("accepts feature entities", () => {
			expect(
				isPluginCreatedNote({ ...base, type: "feature", id: "F-1" } as any)
			).toBe(true);
		});
	});
});
