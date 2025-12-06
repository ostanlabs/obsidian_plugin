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
				status: "todo",
				priority: "medium",
				created: "2025-01-01T00:00:00.000Z",
				updated: "2025-01-01T00:00:00.000Z",
				canvas_source: "test.canvas",
				vault_path: "test.md",
			};

			const result = replacePlaceholders(template, frontmatter);

			expect(result).toContain("type: task");
			expect(result).toContain("title: Test Task");
			expect(result).toContain("id: T001");
			expect(result).toContain("# Test Task");
			expect(result).toContain("Effort: Engineering");
			expect(result).toContain("Status: todo");
			expect(result).toContain("Priority: medium");
		});

		it("should handle missing optional fields", () => {
			const template = `Parent: {{parent}}`;

			const frontmatter: ItemFrontmatter = {
				type: "task",
				title: "Test",
				effort: "Engineering",
				id: "T001",
				status: "todo",
				priority: "medium",
				created: "2025-01-01T00:00:00.000Z",
				updated: "2025-01-01T00:00:00.000Z",
				canvas_source: "test.canvas",
				vault_path: "test.md",
			};

			const result = replacePlaceholders(template, frontmatter);
			expect(result).toBe("Parent: ");
		});

		it("should handle parent field", () => {
			const template = `Parent: {{parent}}`;

			const frontmatter: ItemFrontmatter = {
				type: "task",
				title: "Test",
				effort: "Engineering",
				id: "T001",
				parent: "A001",
				status: "todo",
				priority: "medium",
				created: "2025-01-01T00:00:00.000Z",
				updated: "2025-01-01T00:00:00.000Z",
				canvas_source: "test.canvas",
				vault_path: "test.md",
			};

			const result = replacePlaceholders(template, frontmatter);
			expect(result).toBe("Parent: A001");
		});
	});
});

