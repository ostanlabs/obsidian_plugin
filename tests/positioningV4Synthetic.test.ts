/**
 * Synthetic-input tests for PositioningEngineV4.
 *
 * Complements positioningV4.test.ts (which drives the engine off real vault
 * fixtures) by feeding small hand-built EntityData sets to exercise the early
 * validation, logging, dangling-target warning and reduced-schema relationship
 * branches (affects->document, implements->feature, document->feature).
 */
import {
	PositioningEngineV4,
	EntityData,
	EntityType,
} from "../util/positioningV4";

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation(() => {});
	jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

function ent(partial: Partial<EntityData> & { entityId: string; type: EntityType }): EntityData {
	return {
		nodeId: `node-${partial.entityId}`,
		workstream: "engineering",
		dependsOn: [],
		blocks: [],
		enables: [],
		affects: [],
		implementedBy: [],
		implements: [],
		documents: [],
		filePath: `${partial.entityId}.md`,
		...partial,
	} as EntityData;
}

describe("PositioningEngineV4 - synthetic inputs", () => {
	it("handles an empty entity list", () => {
		const engine = new PositioningEngineV4();
		const res = engine.calculatePositions([]);
		expect(res.positions.size).toBe(0);
		expect(res.errors).toEqual([]);
	});

	it("records an error for an entity missing required fields", () => {
		const engine = new PositioningEngineV4();
		const bad = { entityId: "", nodeId: "", type: undefined } as unknown as EntityData;
		const res = engine.calculatePositions([bad]);
		expect(res.errors.some((e) => e.includes("Invalid entity"))).toBe(true);
	});

	it("positions a milestone with a child story (containment)", () => {
		const engine = new PositioningEngineV4();
		const res = engine.calculatePositions([
			ent({ entityId: "M-001", type: "milestone" }),
			ent({ entityId: "S-001", type: "story", parent: "M-001" }),
		]);
		expect(res.positions.get("node-M-001")).toBeDefined();
		expect(res.positions.get("node-S-001")).toBeDefined();
	});

	it("positions a story with a dependent task without crashing on cross refs", () => {
		const engine = new PositioningEngineV4();
		const res = engine.calculatePositions([
			ent({ entityId: "M-001", type: "milestone" }),
			ent({ entityId: "S-001", type: "story", parent: "M-001" }),
			ent({ entityId: "T-001", type: "task", parent: "S-001", dependsOn: ["T-002"] }),
			ent({ entityId: "T-002", type: "task", parent: "S-001" }),
		]);
		expect(res.positions.get("node-T-001")).toBeDefined();
		expect(res.positions.get("node-T-002")).toBeDefined();
	});

	it("tolerates a dangling parent reference", () => {
		const engine = new PositioningEngineV4();
		const res = engine.calculatePositions([
			ent({ entityId: "S-001", type: "story", parent: "M-999" }),
		]);
		// Should still produce a result; the missing parent must not throw
		expect(res.positions.get("node-S-001")).toBeDefined();
	});

	it("handles reduced-schema relationships: implements->feature, affects->document, document->feature", () => {
		const engine = new PositioningEngineV4();
		const res = engine.calculatePositions([
			ent({ entityId: "F-001", type: "feature" }),
			ent({ entityId: "DOC-001", type: "document", documents: ["F-001"] }),
			ent({ entityId: "M-001", type: "milestone", implements: ["F-001"] }),
			ent({ entityId: "DEC-001", type: "decision", affects: ["DOC-001"] }),
		]);
		expect(res.positions.size).toBeGreaterThan(0);
	});

	it("invokes the logger callback and verbose logging", () => {
		const logged: string[] = [];
		const engine = new PositioningEngineV4({}, (m) => logged.push(m), true);
		engine.calculatePositions([ent({ entityId: "M-001", type: "milestone" })]);
		expect(logged.length).toBeGreaterThan(0);
	});

	it("is deterministic across repeated runs (state reset)", () => {
		const engine = new PositioningEngineV4();
		const input = [
			ent({ entityId: "M-001", type: "milestone" }),
			ent({ entityId: "S-001", type: "story", parent: "M-001" }),
		];
		const a = engine.calculatePositions(input);
		const b = engine.calculatePositions(input);
		expect(b.positions.get("node-M-001")).toEqual(
			a.positions.get("node-M-001")
		);
		expect(b.errors).toEqual(a.errors);
	});

	it("positions a full deep chain decision→document→feature→story→milestone", () => {
		const engine = new PositioningEngineV4();
		const res = engine.calculatePositions([
			ent({ entityId: "M-001", type: "milestone" }),
			ent({ entityId: "S-001", type: "story", parent: "M-001" }),
			ent({ entityId: "F-001", type: "feature", implementedBy: ["S-001"] }),
			ent({ entityId: "DOC-001", type: "document", documents: ["F-001"] }),
			ent({ entityId: "DEC-001", type: "decision", affects: ["DOC-001"] }),
		]);
		for (const id of ["M-001", "S-001", "F-001", "DOC-001", "DEC-001"]) {
			expect(res.positions.get(`node-${id}`)).toBeDefined();
		}
	});

	it("positions a deep chain whose TOP feature is an orphan (no implements)", () => {
		// Mirrors the real-vault bug: an orphan feature at the top of the chain with
		// documents (multi-target ⇒ deferred) and decisions must not drop out.
		const engine = new PositioningEngineV4();
		const res = engine.calculatePositions([
			ent({ entityId: "F-001", type: "feature", documentedBy: ["DOC-001", "DOC-002"] }),
			ent({ entityId: "F-002", type: "feature", documentedBy: ["DOC-001", "DOC-002"] }),
			// Documents documenting BOTH features ⇒ multiple containment parents ⇒ deferred.
			ent({ entityId: "DOC-001", type: "document", documents: ["F-001", "F-002"], affects: [] }),
			ent({ entityId: "DOC-002", type: "document", documents: ["F-001", "F-002"] }),
			// Decisions affecting BOTH documents ⇒ multiple parents ⇒ deferred/cascade.
			ent({ entityId: "DEC-001", type: "decision", affects: ["DOC-001", "DOC-002"] }),
			ent({ entityId: "DEC-002", type: "decision", affects: ["DOC-001"] }),
		]);
		for (const id of ["F-001", "F-002", "DOC-001", "DOC-002", "DEC-001", "DEC-002"]) {
			expect(res.positions.get(`node-${id}`)).toBeDefined();
		}
	});

	it("migrates decision enables -> affects", () => {
		const engine = new PositioningEngineV4();
		const res = engine.calculatePositions([
			ent({ entityId: "DOC-001", type: "document" }),
			ent({ entityId: "DEC-001", type: "decision", enables: ["DOC-001"] }),
		]);
		expect(res.positions.size).toBeGreaterThan(0);
	});
});
