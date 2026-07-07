import {
	loadCanvasData,
	saveCanvasData,
	updateNode,
	addNode,
	removeNode,
	generateEdgeId,
	createEdge,
	addEdge,
	edgeExists,
	findNodeByFilePath,
	findNodeByEntityId,
	getColorForEffort,
	getCanvasCenter,
	captureCanvasViewport,
	restoreCanvasViewport,
	closeCanvasViews,
	reopenCanvasViews,
	reloadCanvasViews,
	reloadCanvasViewsWithViewport,
	createNode,
	CanvasData,
	CanvasNode,
} from "../util/canvas";

beforeAll(() => {
	jest.spyOn(console, "debug").mockImplementation(() => {});
	jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

function emptyData(): CanvasData {
	return { nodes: [], edges: [] };
}

describe("canvas - data mutation helpers", () => {
	it("addNode / removeNode", () => {
		const data = emptyData();
		addNode(data, { id: "n1", type: "text", x: 0, y: 0, width: 1, height: 1 });
		expect(data.nodes).toHaveLength(1);
		expect(removeNode(data, "n1")).toBe(true);
		expect(removeNode(data, "missing")).toBe(false);
		expect(data.nodes).toHaveLength(0);
	});

	it("updateNode merges updates", () => {
		const data: CanvasData = {
			nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: 1, height: 1 }],
			edges: [],
		};
		updateNode(data, "n1", { x: 99, color: "3" });
		expect(data.nodes[0].x).toBe(99);
		expect(data.nodes[0].color).toBe("3");
	});

	it("updateNode throws for a missing node", () => {
		expect(() => updateNode(emptyData(), "nope", { x: 1 })).toThrow();
	});
});

describe("canvas - edges", () => {
	it("generateEdgeId is unique and prefixed", () => {
		const a = generateEdgeId();
		const b = generateEdgeId();
		expect(a).toMatch(/^edge-/);
		expect(a).not.toBe(b);
	});

	it("createEdge with and without a label", () => {
		const withLabel = createEdge("a", "b", "blocks", "right", "left");
		expect(withLabel.fromNode).toBe("a");
		expect(withLabel.toNode).toBe("b");
		expect(withLabel.fromSide).toBe("right");
		expect(withLabel.toSide).toBe("left");
		expect(withLabel.label).toBe("blocks");

		const noLabel = createEdge("a", "b");
		expect(noLabel.label).toBeUndefined();
		expect(noLabel.fromSide).toBe("bottom");
		expect(noLabel.toSide).toBe("top");
	});

	it("addEdge / edgeExists", () => {
		const data = emptyData();
		addEdge(data, createEdge("a", "b"));
		expect(edgeExists(data, "a", "b")).toBe(true);
		expect(edgeExists(data, "b", "a")).toBe(false);
	});
});

describe("canvas - node lookup", () => {
	const data: CanvasData = {
		nodes: [
			{ id: "n1", type: "file", x: 0, y: 0, width: 1, height: 1, file: "notes/M-001 Title.md" },
			{
				id: "n2",
				type: "file",
				x: 0,
				y: 0,
				width: 1,
				height: 1,
				file: "notes/T-050.md",
				metadata: { entityId: "T-050" },
			},
			{ id: "n3", type: "text", x: 0, y: 0, width: 1, height: 1, text: "note" },
		],
		edges: [],
	};

	it("findNodeByFilePath", () => {
		expect(findNodeByFilePath(data, "notes/T-050.md")?.id).toBe("n2");
		expect(findNodeByFilePath(data, "missing.md")).toBeUndefined();
	});

	it("findNodeByEntityId via metadata", () => {
		expect(findNodeByEntityId(data, "T-050")?.id).toBe("n2");
	});

	it("findNodeByEntityId via file name prefix", () => {
		expect(findNodeByEntityId(data, "M-001")?.id).toBe("n1");
		expect(findNodeByEntityId(data, "NOPE")).toBeUndefined();
	});
});

describe("canvas - getColorForEffort", () => {
	it("maps known efforts", () => {
		expect(getColorForEffort("Engineering")).toBe("3");
		expect(getColorForEffort("Business")).toBe("6");
	});
	it("returns undefined for unknown efforts", () => {
		expect(getColorForEffort("Unknown")).toBeUndefined();
	});
});

describe("canvas - load/save", () => {
	it("loadCanvasData parses JSON from the vault", async () => {
		const payload: CanvasData = {
			nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: 1, height: 1 }],
			edges: [],
		};
		const app = { vault: { read: async () => JSON.stringify(payload) } } as any;
		const data = await loadCanvasData(app, { path: "b.canvas" } as any);
		expect(data.nodes[0].id).toBe("n1");
	});

	it("saveCanvasData writes JSON back to the vault", async () => {
		let written = "";
		const app = {
			vault: { modify: async (_f: any, c: string) => (written = c) },
		} as any;
		await saveCanvasData(app, { path: "b.canvas" } as any, emptyData());
		expect(JSON.parse(written)).toEqual({ nodes: [], edges: [] });
	});
});

describe("canvas - viewport helpers with a fake workspace", () => {
	function makeApp(view: any) {
		return {
			workspace: {
				getLeavesOfType: (t: string) =>
					t === "canvas" ? [{ view }] : [],
			},
		} as any;
	}

	it("getCanvasCenter falls back to randomized origin with no app", () => {
		const c = getCanvasCenter(null as any);
		expect(typeof c.x).toBe("number");
		expect(typeof c.y).toBe("number");
	});

	it("getCanvasCenter computes viewport center when a canvas is open", () => {
		const view = {
			file: { path: "b.canvas" },
			canvas: {
				x: 100,
				y: 200,
				zoom: 1,
				wrapperEl: { getBoundingClientRect: () => ({ width: 400, height: 200 }) },
			},
		};
		const app = makeApp(view);
		const c = getCanvasCenter(app, { path: "b.canvas" } as any);
		// center is 100 + 200 +/- 50, 200 + 100 +/- 50
		expect(c.x).toBeGreaterThanOrEqual(250);
		expect(c.x).toBeLessThanOrEqual(350);
		expect(c.y).toBeGreaterThanOrEqual(250);
		expect(c.y).toBeLessThanOrEqual(350);
	});

	it("captureCanvasViewport returns viewport for a matching canvas", () => {
		const view = { file: { path: "b.canvas" }, canvas: { x: 5, y: 6, zoom: 2 } };
		const vp = captureCanvasViewport(makeApp(view), { path: "b.canvas" } as any);
		expect(vp).toEqual({ x: 5, y: 6, zoom: 2 });
	});

	it("captureCanvasViewport returns null when no canvas matches", () => {
		const app = { workspace: { getLeavesOfType: () => [] } } as any;
		expect(captureCanvasViewport(app, { path: "b.canvas" } as any)).toBeNull();
	});

	it("restoreCanvasViewport uses setViewport when available", async () => {
		let called: any = null;
		const view = {
			file: { path: "b.canvas" },
			canvas: {
				setViewport: (x: number, y: number, z: number) => (called = { x, y, z }),
			},
		};
		const ok = await restoreCanvasViewport(
			makeApp(view),
			{ path: "b.canvas" } as any,
			{ x: 1, y: 2, zoom: 3 }
		);
		expect(ok).toBe(true);
		expect(called).toEqual({ x: 1, y: 2, z: 3 });
	});

	it("restoreCanvasViewport falls back to direct property assignment", async () => {
		const canvas: any = { x: 0, y: 0, zoom: 1 };
		const view = { file: { path: "b.canvas" }, canvas };
		const ok = await restoreCanvasViewport(
			makeApp(view),
			{ path: "b.canvas" } as any,
			{ x: 7, y: 8, zoom: 9 }
		);
		expect(ok).toBe(true);
		expect(canvas.x).toBe(7);
		expect(canvas.zoom).toBe(9);
	});

	it("restoreCanvasViewport gives up after retries when no canvas found", async () => {
		const app = { workspace: { getLeavesOfType: () => [] } } as any;
		const ok = await restoreCanvasViewport(
			app,
			{ path: "b.canvas" } as any,
			{ x: 1, y: 2, zoom: 3 },
			2,
			1
		);
		expect(ok).toBe(false);
	});
});

describe("canvas - close/reopen views", () => {
	it("closeCanvasViews closes matching leaves and returns them", async () => {
		const setStateCalls: any[] = [];
		const matchingLeaf = {
			view: {
				file: { path: "b.canvas" },
				getViewType: () => "canvas",
			},
			setViewState: async (s: any) => setStateCalls.push(s),
		};
		const otherLeaf = {
			view: { file: { path: "other.canvas" }, getViewType: () => "canvas" },
			setViewState: async (s: any) => setStateCalls.push(s),
		};
		const app = {
			workspace: { getLeavesOfType: () => [matchingLeaf, otherLeaf] },
		} as any;
		const closed = await closeCanvasViews(app, { path: "b.canvas" } as any);
		expect(closed).toHaveLength(1);
		expect(setStateCalls).toEqual([{ type: "empty" }]);
	});

	it("reopenCanvasViews restores canvas view state", async () => {
		const states: any[] = [];
		const leaf = { setViewState: async (s: any) => states.push(s) };
		await reopenCanvasViews({} as any, { path: "b.canvas" } as any, [leaf as any]);
		expect(states[0]).toEqual({
			type: "canvas",
			state: { file: "b.canvas" },
		});
	});
});

describe("canvas - createNode", () => {
	it("creates a text node with text, color and metadata", () => {
		const node = createNode("text", 10, 20, 300, 80, {
			text: "hi",
			color: "3",
			metadata: { entityId: "T-001" },
		});
		expect(node.type).toBe("text");
		expect(node.x).toBe(10);
		expect(node.y).toBe(20);
		expect(node.width).toBe(300);
		expect(node.height).toBe(80);
		expect(node.text).toBe("hi");
		expect(node.color).toBe("3");
		expect(node.metadata).toEqual({ entityId: "T-001" });
		expect(node.file).toBeUndefined();
		expect(node.id).toBeTruthy();
	});

	it("creates a file node with defaults and no optional content", () => {
		const node = createNode("file", 0, 0);
		expect(node.type).toBe("file");
		expect(node.width).toBe(400);
		expect(node.height).toBe(100);
		expect(node.file).toBeUndefined();
		expect(node.text).toBeUndefined();
		expect(node.color).toBeUndefined();
		expect(node.metadata).toBeUndefined();
	});

	it("sets file when provided for a file node", () => {
		const node = createNode("file", 0, 0, 400, 100, { file: "notes/x.md" });
		expect(node.file).toBe("notes/x.md");
	});
});

describe("canvas - saveCanvasData debug filter", () => {
	it("counts file nodes when serializing (exercises the filter callback)", async () => {
		let written = "";
		const app = {
			vault: { modify: async (_f: any, c: string) => (written = c) },
		} as any;
		const data: CanvasData = {
			nodes: [
				{ id: "n1", type: "file", x: 0, y: 0, width: 1, height: 1, file: "a.md" },
				{ id: "n2", type: "text", x: 0, y: 0, width: 1, height: 1, text: "t" },
			],
			edges: [],
		};
		await saveCanvasData(app, { path: "b.canvas" } as any, data);
		expect(JSON.parse(written).nodes).toHaveLength(2);
	});
});

describe("canvas - getCanvasCenter error handling", () => {
	it("falls back to randomized origin when the workspace lookup throws", () => {
		const app = {
			workspace: {
				getLeavesOfType: () => {
					throw new Error("boom");
				},
			},
		} as any;
		const c = getCanvasCenter(app, { path: "b.canvas" } as any);
		expect(c.x).toBeGreaterThanOrEqual(-50);
		expect(c.x).toBeLessThanOrEqual(50);
		expect(c.y).toBeGreaterThanOrEqual(-50);
		expect(c.y).toBeLessThanOrEqual(50);
	});

	it("treats missing x/y/zoom as defaults (0/0/1) when computing the center", () => {
		const app = {
			workspace: {
				getLeavesOfType: () => [
					{
						view: {
							file: { path: "b.canvas" },
							canvas: {
								// x, y, zoom intentionally undefined -> exercise ?? defaults
								wrapperEl: {
									getBoundingClientRect: () => ({ width: 400, height: 200 }),
								},
							},
						},
					},
				],
			},
		} as any;
		const c = getCanvasCenter(app, { path: "b.canvas" } as any);
		// x=0,y=0,zoom=1 -> center (200,100) +/- 50
		expect(c.x).toBeGreaterThanOrEqual(150);
		expect(c.x).toBeLessThanOrEqual(250);
		expect(c.y).toBeGreaterThanOrEqual(50);
		expect(c.y).toBeLessThanOrEqual(150);
	});

	it("falls back when a matching canvas has no wrapperEl", () => {
		const app = {
			workspace: {
				getLeavesOfType: () => [
					{ view: { file: { path: "b.canvas" }, canvas: { x: 1, y: 1, zoom: 1 } } },
				],
			},
		} as any;
		const c = getCanvasCenter(app, { path: "b.canvas" } as any);
		// No wrapperEl -> fall through to randomized origin near 0.
		expect(c.x).toBeGreaterThanOrEqual(-50);
		expect(c.x).toBeLessThanOrEqual(50);
	});
});

describe("canvas - restoreCanvasViewport extra branches", () => {
	function makeApp(view: any) {
		return {
			workspace: {
				getLeavesOfType: (t: string) => (t === "canvas" ? [{ view }] : []),
			},
		} as any;
	}

	it("calls requestFrame and markViewportChanged on the direct-property path", async () => {
		const frames: string[] = [];
		const canvas: any = {
			x: 0,
			y: 0,
			zoom: 1,
			requestFrame: () => frames.push("frame"),
			markViewportChanged: () => frames.push("changed"),
		};
		const view = { file: { path: "b.canvas" }, canvas };
		const ok = await restoreCanvasViewport(
			makeApp(view),
			{ path: "b.canvas" } as any,
			{ x: 3, y: 4, zoom: 5 }
		);
		expect(ok).toBe(true);
		expect(canvas.x).toBe(3);
		expect(frames).toEqual(["frame", "changed"]);
	});

	it("catches a throwing setViewport and gives up after retries", async () => {
		const view = {
			file: { path: "b.canvas" },
			canvas: {
				setViewport: () => {
					throw new Error("nope");
				},
			},
		};
		const ok = await restoreCanvasViewport(
			makeApp(view),
			{ path: "b.canvas" } as any,
			{ x: 1, y: 2, zoom: 3 },
			2,
			1
		);
		expect(ok).toBe(false);
	});
});

describe("canvas - reload helpers", () => {
	it("reloadCanvasViews closes and reopens matching views", async () => {
		const setStates: any[] = [];
		const leaf = {
			view: { file: { path: "b.canvas" }, getViewType: () => "canvas" },
			setViewState: async (s: any) => setStates.push(s),
		};
		const app = {
			workspace: { getLeavesOfType: () => [leaf] },
		} as any;
		await reloadCanvasViews(app, { path: "b.canvas" } as any);
		// One "empty" (close) then one "canvas" (reopen).
		expect(setStates.map((s) => s.type)).toEqual(["empty", "canvas"]);
	});

	it("reloadCanvasViewsWithViewport returns early when no views are open", async () => {
		const app = {
			workspace: { getLeavesOfType: () => [] },
		} as any;
		// Should resolve without throwing and without touching a viewport.
		await expect(
			reloadCanvasViewsWithViewport(app, { path: "b.canvas" } as any)
		).resolves.toBeUndefined();
	});

	it("reloadCanvasViewsWithViewport captures, reloads and restores the viewport", async () => {
		const setStates: any[] = [];
		const canvas: any = { x: 11, y: 22, zoom: 2 };
		const leaf = {
			view: { file: { path: "b.canvas" }, getViewType: () => "canvas", canvas },
			setViewState: async (s: any) => setStates.push(s),
		};
		const app = {
			workspace: { getLeavesOfType: () => [leaf] },
		} as any;
		await reloadCanvasViewsWithViewport(app, { path: "b.canvas" } as any);
		expect(setStates.map((s) => s.type)).toEqual(["empty", "canvas"]);
	});
});
