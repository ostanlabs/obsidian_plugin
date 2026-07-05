import {
	stripQuotes,
	sanitizeRelationshipValue,
	sanitizeAllRelationships,
} from "../util/sanitizeRelationships";

describe("sanitizeRelationships", () => {
	describe("stripQuotes", () => {
		it("strips double quotes", () => {
			expect(stripQuotes('"M-001"')).toBe("M-001");
		});
		it("strips single quotes", () => {
			expect(stripQuotes("'S-042'")).toBe("S-042");
		});
		it("leaves unquoted values unchanged", () => {
			expect(stripQuotes("T-123")).toBe("T-123");
		});
		it("trims surrounding whitespace", () => {
			expect(stripQuotes("  T-9  ")).toBe("T-9");
		});
		it("returns non-string input as-is", () => {
			// @ts-expect-error runtime guard
			expect(stripQuotes(null)).toBeNull();
		});
		it("does not strip mismatched quote pairs", () => {
			expect(stripQuotes("'M-001\"")).toBe("'M-001\"");
		});
	});

	describe("sanitizeRelationshipValue", () => {
		it("preserves null and undefined", () => {
			expect(sanitizeRelationshipValue(null)).toBeNull();
			expect(sanitizeRelationshipValue(undefined)).toBeUndefined();
		});
		it("strips quotes on a single string", () => {
			expect(sanitizeRelationshipValue('"M-001"')).toBe("M-001");
		});
		it("strips quotes on every array element", () => {
			expect(
				sanitizeRelationshipValue(['"M-001"', "'S-042'", "T-1"])
			).toEqual(["M-001", "S-042", "T-1"]);
		});
		it("handles an empty array", () => {
			expect(sanitizeRelationshipValue([])).toEqual([]);
		});
		it("returns unexpected types as-is", () => {
			// @ts-expect-error runtime guard
			expect(sanitizeRelationshipValue(5)).toBe(5);
		});
	});

	describe("sanitizeAllRelationships", () => {
		it("sanitizes all known relationship fields in place", () => {
			const fm: Record<string, unknown> = {
				parent: '"M-001"',
				depends_on: ['"S-001"', "'S-002'"],
				implements: ['"F-001"'],
				documented_by: ["'DOC-001'"],
				decided_by: ['"DEC-001"'],
				title: '"not a relationship"',
			};
			const out = sanitizeAllRelationships(fm);
			expect(out).toBe(fm); // mutated in place, same ref
			expect(fm.parent).toBe("M-001");
			expect(fm.depends_on).toEqual(["S-001", "S-002"]);
			expect(fm.implements).toEqual(["F-001"]);
			expect(fm.documented_by).toEqual(["DOC-001"]);
			expect(fm.decided_by).toEqual(["DEC-001"]);
			// non-relationship field untouched
			expect(fm.title).toBe('"not a relationship"');
		});

		it("ignores fields that are not present", () => {
			const fm: Record<string, unknown> = { id: "M-001" };
			const out = sanitizeAllRelationships(fm);
			expect(out).toEqual({ id: "M-001" });
		});

		it("is idempotent", () => {
			const fm: Record<string, unknown> = { depends_on: ['"S-1"'] };
			sanitizeAllRelationships(fm);
			sanitizeAllRelationships(fm);
			expect(fm.depends_on).toEqual(["S-1"]);
		});
	});
});
