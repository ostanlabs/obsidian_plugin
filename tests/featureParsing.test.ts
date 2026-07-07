import { parseFutureFeatures, mapCategoryToPhase, titleSimilarity } from "../util/featureParsing";

describe("parseFutureFeatures", () => {
	it("groups feature items under the preceding ## / ### category header", () => {
		const md = [
			"## Core",
			"- [x] Login flow",
			"- [ ] Password reset",
			"### Later",
			"* Dark mode",
		].join("\n");
		expect(parseFutureFeatures(md)).toEqual([
			{ title: "Login flow", category: "Core", status: "Complete" },
			{ title: "Password reset", category: "Core", status: "Planned" },
			{ title: "Dark mode", category: "Later", status: "Planned" },
		]);
	});

	it("marks [x]/[X] as Complete and unchecked as Planned", () => {
		expect(parseFutureFeatures("- [X] Done thing")[0].status).toBe("Complete");
		expect(parseFutureFeatures("- [ ] Todo thing")[0].status).toBe("Planned");
		expect(parseFutureFeatures("- plain item")[0].status).toBe("Planned");
	});

	it("skips indented sub-items", () => {
		const md = ["- Parent", "  - child", "    - grandchild"].join("\n");
		expect(parseFutureFeatures(md).map((f) => f.title)).toEqual(["Parent"]);
	});

	it("uses an empty category when no header precedes items", () => {
		expect(parseFutureFeatures("- Orphan")[0].category).toBe("");
	});

	it("returns [] for content with no feature lines", () => {
		expect(parseFutureFeatures("# Title\n\nsome prose")).toEqual([]);
		expect(parseFutureFeatures("")).toEqual([]);
	});
});

describe("mapCategoryToPhase", () => {
	it.each([
		["MVP essentials", "MVP"],
		["Core features", "MVP"],
		["Phase 0 setup", "0"],
		["p1 stuff", "1"],
		["Phase 2", "2"],
		["p3", "3"],
		["Phase 4 things", "4"],
		["p5", "5"],
		["Future ideas", "5"],
		["maybe later", "5"],
		["uncategorised", "MVP"],
	])("maps %j → %s", (input, expected) => {
		expect(mapCategoryToPhase(input)).toBe(expected);
	});
});

describe("titleSimilarity", () => {
	it("is 1 for identical titles", () => {
		expect(titleSimilarity("build the thing", "build the thing")).toBe(1);
	});
	it("is 0 when no words (>2 chars) overlap", () => {
		expect(titleSimilarity("foo bar", "baz qux")).toBe(0);
	});
	it("ignores words of length ≤ 2", () => {
		// only "cat" (>2) overlaps; denominator = max set size
		expect(titleSimilarity("a cat", "an cat")).toBeCloseTo(1 / 2, 5);
	});
	it("scores partial overlap by max set size", () => {
		// overlap {alpha, beta}=2 ; sizes 3 and 2 → 2/3
		expect(titleSimilarity("alpha beta gamma", "alpha beta")).toBeCloseTo(2 / 3, 5);
	});
});
