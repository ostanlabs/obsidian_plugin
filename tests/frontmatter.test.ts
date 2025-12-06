import { parseFrontmatter, updateFrontmatter, serializeFrontmatter } from "../util/frontmatter";
import { ItemFrontmatter } from "../types";

describe("Frontmatter", () => {
	describe("parseFrontmatter", () => {
		it("should parse valid frontmatter", () => {
			const content = `---
type: task
title: Test Task
effort: Engineering
id: T001
status: todo
priority: medium
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
			expect(result?.id).toBe("T001");
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
status: todo
---

# Content`;

			const result = updateFrontmatter(content, {
				title: "New Title",
				status: "done",
			});

			expect(result).toContain("title: New Title");
			expect(result).toContain("status: done");
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
				id: "T001",
				status: "todo",
				priority: "medium",
				created: "2025-01-01T00:00:00.000Z",
				updated: "2025-01-01T00:00:00.000Z",
				canvas_source: "test.canvas",
				vault_path: "test.md",
			};

			const result = serializeFrontmatter(frontmatter);

			expect(result).toContain("---");
			expect(result).toContain("type: task");
			expect(result).toContain("title: Test Task");
			expect(result).toContain("id: T001");
		});

		it("should handle optional parent field", () => {
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

			const result = serializeFrontmatter(frontmatter);
			expect(result).toContain("parent: A001");
		});
	});
});

