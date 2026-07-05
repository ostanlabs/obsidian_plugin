import {
	sanitizeYamlValue,
	sanitizeObjectForYaml,
	sanitizeFrontmatter,
	hasUnsafeYamlChars,
	getUnsafeChars,
} from "../util/yamlSanitizer";

describe("yamlSanitizer", () => {
	describe("sanitizeYamlValue", () => {
		it("replaces a colon with a dash", () => {
			expect(sanitizeYamlValue("Component 3: Config Loader")).toBe(
				"Component 3 - Config Loader"
			);
		});

		it("collapses the multiple spaces produced by replacements", () => {
			// ": " -> " - " then double-space collapse
			expect(sanitizeYamlValue("Phase 3.1:   Integration")).toBe(
				"Phase 3.1 - Integration"
			);
		});

		it("removes hash, at, backtick and greater-than chars", () => {
			expect(sanitizeYamlValue("a#b@c`d>e")).toBe("abcde");
		});

		it("converts brackets and braces to parentheses", () => {
			expect(sanitizeYamlValue("arr[x] obj{y}")).toBe("arr(x) obj(y)");
		});

		it("replaces pipe with dash", () => {
			expect(sanitizeYamlValue("a|b")).toBe("a-b");
		});

		it("trims leading/trailing whitespace", () => {
			expect(sanitizeYamlValue("  hello  ")).toBe("hello");
		});

		it("returns empty string unchanged", () => {
			expect(sanitizeYamlValue("")).toBe("");
		});

		it("returns non-string input unchanged", () => {
			// @ts-expect-error testing runtime guard
			expect(sanitizeYamlValue(null)).toBeNull();
			// @ts-expect-error testing runtime guard
			expect(sanitizeYamlValue(42)).toBe(42);
		});

		it("is idempotent on already-safe values", () => {
			const safe = "Just a normal title";
			expect(sanitizeYamlValue(safe)).toBe(safe);
			expect(sanitizeYamlValue(sanitizeYamlValue(safe))).toBe(safe);
		});
	});

	describe("hasUnsafeYamlChars", () => {
		it("detects a colon", () => {
			expect(hasUnsafeYamlChars("a: b")).toBe(true);
		});
		it("returns false for safe strings", () => {
			expect(hasUnsafeYamlChars("all good here")).toBe(false);
		});
		it("returns false for empty or non-string", () => {
			expect(hasUnsafeYamlChars("")).toBe(false);
			// @ts-expect-error runtime guard
			expect(hasUnsafeYamlChars(undefined)).toBe(false);
		});
	});

	describe("getUnsafeChars", () => {
		it("lists all unsafe characters found", () => {
			const found = getUnsafeChars("a:b#c");
			expect(found).toContain(":");
			expect(found).toContain("#");
		});
		it("returns empty array for safe values", () => {
			expect(getUnsafeChars("safe")).toEqual([]);
		});
		it("returns empty array for non-string", () => {
			// @ts-expect-error runtime guard
			expect(getUnsafeChars(null)).toEqual([]);
		});
	});

	describe("sanitizeObjectForYaml", () => {
		it("sanitizes strings, arrays of strings and nested objects", () => {
			const result = sanitizeObjectForYaml({
				title: "T: X",
				count: 3,
				flag: true,
				tags: ["a:b", "c"],
				nested: { note: "n#1" },
			});
			expect(result.title).toBe("T - X");
			expect(result.count).toBe(3);
			expect(result.flag).toBe(true);
			expect(result.tags).toEqual(["a -b", "c"]);
			expect((result.nested as { note: string }).note).toBe("n1");
		});

		it("leaves non-string array items unchanged", () => {
			const result = sanitizeObjectForYaml({ nums: [1, 2, 3] });
			expect(result.nums).toEqual([1, 2, 3]);
		});
	});

	describe("sanitizeFrontmatter", () => {
		it("sanitizes only the known string fields", () => {
			const fm = sanitizeFrontmatter({
				title: "A: B",
				description: "d#1",
				id: "M-001", // not in sanitized field list; preserved
				depends_on: ["X:Y"], // array field ignored by this fn
			});
			expect(fm.title).toBe("A - B");
			expect(fm.description).toBe("d1");
			expect(fm.id).toBe("M-001");
			expect(fm.depends_on).toEqual(["X:Y"]);
		});

		it("does not mutate the original object", () => {
			const orig = { title: "A: B" };
			const out = sanitizeFrontmatter(orig);
			expect(orig.title).toBe("A: B");
			expect(out.title).toBe("A - B");
		});
	});
});
