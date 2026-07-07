import { buildCanvasMetadata } from "../util/canvasMetadata";

describe("buildCanvasMetadata", () => {
	it("sets the constant plugin and shape fields", () => {
		const md = buildCanvasMetadata("task", "My Task", { showId: true });
		expect(md?.plugin).toBe("canvas-project-manager");
		expect(md?.shape).toBe("entity");
	});

	it("defaults alias to the title when no alias is provided", () => {
		const md = buildCanvasMetadata("story", "Story Title", { showId: false });
		expect(md?.alias).toBe("Story Title");
	});

	it("uses the provided alias over the title", () => {
		const md = buildCanvasMetadata("story", "Story Title", {
			alias: "Custom Alias",
			showId: false,
		});
		expect(md?.alias).toBe("Custom Alias");
	});

	it("passes showId through when true", () => {
		const md = buildCanvasMetadata("milestone", "M", { showId: true });
		expect(md?.showId).toBe(true);
	});

	it("passes showId through when false", () => {
		const md = buildCanvasMetadata("milestone", "M", { showId: false });
		expect(md?.showId).toBe(false);
	});

	it("sets effortColor when it is a truthy string", () => {
		const md = buildCanvasMetadata("feature", "F", {
			showId: true,
			effortColor: "#ff0000",
		});
		expect(md?.effortColor).toBe("#ff0000");
	});

	it("omits effortColor when it is an empty string", () => {
		const md = buildCanvasMetadata("feature", "F", {
			showId: true,
			effortColor: "",
		});
		expect(md).not.toHaveProperty("effortColor");
	});

	it("omits effortColor when it is undefined", () => {
		const md = buildCanvasMetadata("decision", "D", { showId: true });
		expect(md).not.toHaveProperty("effortColor");
	});
});
