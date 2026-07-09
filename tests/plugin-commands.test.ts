/**
 * Command registration surface, against the in-memory obsidian mock.
 *   - registerCommands(): the open-feature-coverage command exists and its
 *     callback routes to activateFeatureCoverageView() (was registered-but-
 *     unreachable before 1.8.95 — the view had no command or ribbon entry).
 *   - activateFeatureCoverageView(): actually opens + reveals a leaf with the
 *     feature coverage view type when none is open yet.
 */
jest.mock("obsidian", () => require("./harness/obsidian-mock"), { virtual: true });

import CanvasStructuredItemsPlugin from "../main";
import { createTestApp } from "./harness/obsidian-mock";
import { FEATURE_COVERAGE_VIEW_TYPE } from "../ui/FeatureCoverageView";

const MANIFEST = {
	id: "canvas-structured-items",
	name: "Canvas Structured Items",
	version: "0.0.0-test",
	minAppVersion: "1.0.0",
	author: "test",
	description: "test",
};

type Command = { id: string; name: string; callback: () => Promise<void> | void };

function makePlugin() {
	const app = createTestApp();
	const plugin = new CanvasStructuredItemsPlugin(app as never, MANIFEST as never);
	// registerCommands/activateFeatureCoverageView are private; reach them via the mock surface.
	const anyPlugin = plugin as unknown as Record<string, (...a: unknown[]) => unknown> & {
		_commands: Command[];
	};
	anyPlugin.registerCommands();
	return { app, anyPlugin };
}

describe("open-feature-coverage command", () => {
	it("is registered by registerCommands()", () => {
		const { anyPlugin } = makePlugin();
		const cmd = anyPlugin._commands.find((c) => c.id === "open-feature-coverage");
		expect(cmd).toBeDefined();
		expect(cmd!.name).toBe("Project canvas: open feature coverage");
		expect(typeof cmd!.callback).toBe("function");
	});

	it("invokes activateFeatureCoverageView()", async () => {
		const { anyPlugin } = makePlugin();
		const spy = jest
			.spyOn(anyPlugin as never, "activateFeatureCoverageView" as never)
			.mockResolvedValue(undefined as never);
		const cmd = anyPlugin._commands.find((c) => c.id === "open-feature-coverage")!;
		await cmd.callback();
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("opens and reveals a feature coverage leaf when none exists", async () => {
		const { app, anyPlugin } = makePlugin();
		const cmd = anyPlugin._commands.find((c) => c.id === "open-feature-coverage")!;
		await cmd.callback();

		const workspace = app.workspace as unknown as {
			leaves: Array<{ viewState: { type?: string; active?: boolean } | null }>;
			revealedLeaves: unknown[];
		};
		expect(workspace.leaves).toHaveLength(1);
		expect(workspace.leaves[0].viewState).toEqual({
			type: FEATURE_COVERAGE_VIEW_TYPE,
			active: true,
		});
		expect(workspace.revealedLeaves).toContain(workspace.leaves[0]);
	});
});
