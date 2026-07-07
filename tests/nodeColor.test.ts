import { getColorForEffort, resolveEffortColor, resolveNodeColor } from "../util/nodeColor";

describe("nodeColor", () => {
	describe("getColorForEffort", () => {
		it("maps each known effort to its palette colour", () => {
			expect(getColorForEffort("Engineering")).toBe("3");
			expect(getColorForEffort("Business")).toBe("6");
			expect(getColorForEffort("Infra")).toBe("4");
			expect(getColorForEffort("Research")).toBe("2");
			expect(getColorForEffort("Design")).toBe("1");
			expect(getColorForEffort("Marketing")).toBe("5");
		});
		it("returns undefined for an unknown effort", () => {
			expect(getColorForEffort("Nope")).toBeUndefined();
			expect(getColorForEffort("")).toBeUndefined();
		});
	});

	describe("resolveEffortColor", () => {
		it("returns undefined when there is no effort", () => {
			expect(resolveEffortColor(undefined)).toBeUndefined();
			expect(resolveEffortColor("")).toBeUndefined();
		});
		it("uses the built-in palette when no override map is given", () => {
			expect(resolveEffortColor("Engineering")).toBe("3");
		});
		it("prefers an explicit per-effort override over the palette", () => {
			expect(resolveEffortColor("Engineering", { Engineering: "9" })).toBe("9");
		});
		it("falls back to the palette when the override map lacks the effort", () => {
			expect(resolveEffortColor("Design", { Engineering: "9" })).toBe("1");
		});
		it("returns undefined when neither override nor palette knows the effort", () => {
			expect(resolveEffortColor("Unknown", { Engineering: "9" })).toBeUndefined();
		});
	});

	describe("resolveNodeColor", () => {
		const cfg = { inProgressColor: "1", effortColorMap: { Engineering: "9" } };
		it("returns the in-progress colour while in progress, ignoring effort", () => {
			expect(resolveNodeColor("Engineering", true, cfg)).toBe("1");
			expect(resolveNodeColor(undefined, true, cfg)).toBe("1");
		});
		it("returns the effort colour when not in progress", () => {
			expect(resolveNodeColor("Engineering", false, cfg)).toBe("9"); // override
			expect(resolveNodeColor("Design", false, cfg)).toBe("1");      // palette
		});
		it("returns undefined when not in progress and effort is absent/unknown", () => {
			expect(resolveNodeColor(undefined, false, cfg)).toBeUndefined();
			expect(resolveNodeColor("Nope", undefined, cfg)).toBeUndefined();
		});
	});
});
