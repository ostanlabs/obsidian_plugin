import { normalizeWorkstream } from "../util/workstream";
import { DEFAULT_SCHEMA } from "../src/entity-core/default-schema";

const ALIASES = DEFAULT_SCHEMA.workstreams.normalization;

describe("normalizeWorkstream", () => {
	it("lowercases the raw value", () => {
		expect(normalizeWorkstream("Engineering")).toBe("engineering");
		expect(normalizeWorkstream("  INFRA  ")).toBe("infra");
	});

	it("applies the schema alias map (canonicalises aliases)", () => {
		expect(normalizeWorkstream("ops", ALIASES)).toBe("infra");
		expect(normalizeWorkstream("DevOps", ALIASES)).toBe("infra");
		expect(normalizeWorkstream("eng", ALIASES)).toBe("engineering");
		expect(normalizeWorkstream("dev", ALIASES)).toBe("engineering");
		expect(normalizeWorkstream("biz", ALIASES)).toBe("business");
		expect(normalizeWorkstream("r&d", ALIASES)).toBe("research");
		expect(normalizeWorkstream("ux", ALIASES)).toBe("design");
	});

	it("passes canonical / unknown values through as lowercase", () => {
		expect(normalizeWorkstream("engineering", ALIASES)).toBe("engineering");
		expect(normalizeWorkstream("Marketing", ALIASES)).toBe("marketing");
		expect(normalizeWorkstream("something-else", ALIASES)).toBe("something-else");
	});

	it("returns the fallback for null/undefined/empty", () => {
		expect(normalizeWorkstream(undefined, ALIASES, "engineering")).toBe("engineering");
		expect(normalizeWorkstream(null, ALIASES)).toBeUndefined();
		expect(normalizeWorkstream("   ", ALIASES, "default")).toBe("default");
	});

	it("works with no alias map (pure lowercase)", () => {
		expect(normalizeWorkstream("Ops")).toBe("ops"); // no map → not canonicalised
	});
});
