import { parseFrontmatter, updateFrontmatter, serializeFrontmatter } from "../util/frontmatter";
import { ItemFrontmatter } from "../types";

describe("Frontmatter", () => {
	describe("parseFrontmatter", () => {
		it("should parse valid frontmatter", () => {
			const content = `---
type: task
title: Test Task
effort: Engineering
id: T-001
status: Not Started
priority: Medium
inProgress: false
created_by_plugin: true
created: 2025-01-01T00:00:00.000Z
updated: 2025-01-01T00:00:00.000Z
canvas_source: test.canvas
vault_path: test.md
---

# Test Task

Content here`;

			const result = parseFrontmatter(content);
			expect(result).not.toBeNull();
			expect(result?.type).toBe("task");
			expect(result?.title).toBe("Test Task");
			expect(result?.id).toBe("T-001");
			expect(result?.inProgress).toBe(false);
		});

		it("should parse inProgress as boolean true", () => {
			const content = `---
type: task
title: Test
effort: Engineering
id: T-001
inProgress: true
---`;

			const result = parseFrontmatter(content);
			expect(result).not.toBeNull();
			expect(result?.inProgress).toBe(true);
		});

		it("should return null for content without frontmatter", () => {
			const content = "# Just a heading\n\nSome content";
			const result = parseFrontmatter(content);
			expect(result).toBeNull();
		});

		it("should return null for incomplete frontmatter", () => {
			const content = `---
type: task
---`;
			const result = parseFrontmatter(content);
			expect(result).toBeNull();
		});
	});

	describe("updateFrontmatter", () => {
		it("should update specific fields", () => {
			const content = `---
type: task
title: Old Title
status: Not Started
---

# Content`;

			const result = updateFrontmatter(content, {
				title: "New Title",
				status: "Completed",
			});

			expect(result).toContain("title: New Title");
			expect(result).toContain("status: Completed");
			expect(result).toContain("type: task");
		});

		it("should not modify content outside frontmatter", () => {
			const content = `---
type: task
title: Test
---

# Content
Some text`;

			const result = updateFrontmatter(content, { title: "Updated" });
			expect(result).toContain("# Content");
			expect(result).toContain("Some text");
		});
	});

	describe("serializeFrontmatter", () => {
		it("should serialize frontmatter to YAML", () => {
			const frontmatter: ItemFrontmatter = {
				type: "task",
				title: "Test Task",
				effort: "Engineering",
				id: "T-001",
				status: "Not Started",
				priority: "Medium",
				inProgress: false,
				created: "2025-01-01T00:00:00.000Z",
				updated: "2025-01-01T00:00:00.000Z",
				canvas_source: "test.canvas",
				vault_path: "test.md",
				created_by_plugin: true,
			};

			const result = serializeFrontmatter(frontmatter);

			expect(result).toContain("---");
			expect(result).toContain("type: task");
			expect(result).toContain("title: Test Task");
			expect(result).toContain("id: T-001");
			expect(result).toContain("inProgress: false");
		});
	});
});

