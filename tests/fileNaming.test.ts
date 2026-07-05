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
		it("produces <ID>_<title>.md", () => {
			expect(generateEntityFilename("M-001", "Kickoff Plan")).toBe(
				"M-001_Kickoff Plan.md"
			);
		});
		it("sanitizes the title portion", () => {
			expect(generateEntityFilename("T-9", "a/b:c")).toBe("T-9_a-b-c.md");
		});
		it("truncates very long titles to 100 chars", () => {
			const longTitle = "x".repeat(200);
			const name = generateEntityFilename("S-1", longTitle);
			// "S-1_" + 100 x's + ".md"
			expect(name).toBe(`S-1_${"x".repeat(100)}.md`);
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
