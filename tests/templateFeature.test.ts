import {
	replaceFeaturePlaceholders,
	DEFAULT_FEATURE_TEMPLATE,
	DEFAULT_ACCOMPLISHMENT_TEMPLATE,
} from "../util/template";
import { FeatureFrontmatter } from "../types";

describe("template - replaceFeaturePlaceholders", () => {
	const fm: FeatureFrontmatter = {
		id: "F-001",
		type: "feature",
		title: "Search",
		workstream: "engineering",
		user_story: "As a user, I want search",
		tier: "OSS",
		phase: "MVP",
		status: "Planned",
		priority: "High",
		personas: ["dev"],
		acceptance_criteria: ["works"],
		test_refs: ["t1"],
		implemented_by: ["M-001", "S-002"],
		documented_by: ["DOC-001"],
		decided_by: ["DEC-001"],
		depends_on: ["F-002"],
		blocks: ["F-003"],
		updated_at: "2025-01-02",
		created_at: "2025-01-01",
		created_by_plugin: true,
	};

	it("replaces scalar placeholders", () => {
		const out = replaceFeaturePlaceholders(DEFAULT_FEATURE_TEMPLATE, fm);
		expect(out).toContain("id: F-001");
		expect(out).toContain("type: feature");
		expect(out).toContain("title: Search");
		expect(out).toContain("workstream: engineering");
		expect(out).toContain('user_story: "As a user, I want search"');
		expect(out).toContain("tier: OSS");
		expect(out).toContain("phase: MVP");
		expect(out).toContain("status: Planned");
		expect(out).toContain("priority: High");
		expect(out).toContain("created_by_plugin: true");
		expect(out).toContain("# F-001: Search");
	});

	it("serializes array placeholders as JSON", () => {
		const out = replaceFeaturePlaceholders(DEFAULT_FEATURE_TEMPLATE, fm);
		expect(out).toContain('personas: ["dev"]');
		expect(out).toContain('acceptance_criteria: ["works"]');
		expect(out).toContain('test_refs: ["t1"]');
		expect(out).toContain('implemented_by: ["M-001","S-002"]');
		expect(out).toContain('documented_by: ["DOC-001"]');
		expect(out).toContain('decided_by: ["DEC-001"]');
		expect(out).toContain('depends_on: ["F-002"]');
		expect(out).toContain('blocks: ["F-003"]');
	});

	it("defaults optional arrays to empty when undefined", () => {
		const minimal = {
			...fm,
			personas: undefined,
			acceptance_criteria: undefined,
			test_refs: undefined,
			implemented_by: undefined,
			documented_by: undefined,
			decided_by: undefined,
			depends_on: undefined,
			blocks: undefined,
		} as FeatureFrontmatter;
		const out = replaceFeaturePlaceholders(
			"{{personas}}|{{implemented_by}}|{{blocks}}",
			minimal
		);
		expect(out).toBe("[]|[]|[]");
	});

	it("defaults created_by_plugin to true when undefined", () => {
		const out = replaceFeaturePlaceholders("{{created_by_plugin}}", {
			...fm,
			created_by_plugin: undefined,
		} as FeatureFrontmatter);
		expect(out).toBe("true");
	});

	it("exports non-empty default templates", () => {
		expect(DEFAULT_ACCOMPLISHMENT_TEMPLATE).toContain("{{title}}");
		expect(DEFAULT_FEATURE_TEMPLATE).toContain("{{id}}");
	});
});
