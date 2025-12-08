import { replacePlaceholders } from "../util/template";
import { ItemFrontmatter } from "../types";

describe("Template", () => {
	describe("replacePlaceholders", () => {
		it("should replace all placeholders", () => {
			const template = `---
type: {{type}}
title: {{title}}
id: {{id}}
---

# {{title}}

Effort: {{effort}}
Status: {{status}}
Priority: {{priority}}
`;

			const frontmatter: ItemFrontmatter = {
				type: "task",
				title: "Test Task",
				effort: "Engineering",
				id: "T001",
				status: "Not Started",
				priority: "Medium",
				created: "2025-01-01T00:00:00.000Z",
				updated: "2025-01-01T00:00:00.000Z",
				canvas_source: "test.canvas",
				vault_path: "test.md",
				created_by_plugin: true,
			};

			const result = replacePlaceholders(template, frontmatter);

			expect(result).toContain("type: task");
			expect(result).toContain("title: Test Task");
			expect(result).toContain("id: T001");
			expect(result).toContain("# Test Task");
			expect(result).toContain("Effort: Engineering");
			expect(result).toContain("Status: Not Started");
			expect(result).toContain("Priority: Medium");
		});

		it("should handle missing optional fields", () => {
			const template = `Notion ID: {{notion_page_id}}`;

			const frontmatter: ItemFrontmatter = {
				type: "task",
				title: "Test",
				effort: "Engineering",
				id: "T001",
				status: "Not Started",
				priority: "Medium",
				created: "2025-01-01T00:00:00.000Z",
				updated: "2025-01-01T00:00:00.000Z",
				canvas_source: "test.canvas",
				vault_path: "test.md",
				created_by_plugin: true,
			};

			const result = replacePlaceholders(template, frontmatter);
			expect(result).toBe("Notion ID: ");
		});
	});
});

