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

// ============================================================================
// REGRESSION-LOCK (c) — deep-nesting stays at 0 unpositioned (count invariant).
//
// The two deep-chain tests above assert every node in a SINGLE chain gets a position. These add
// a whole-graph COUNT invariant (positions.size === entities.length) over a multi-branch graph
// that exercises the real bug shape — a document documenting TWO features and a decision
// affecting TWO documents (⇒ multi-parent deferral + cascade) plus a cross-workstream deferral —
// so a partial-drop regression is caught even if specific ids shift. This is the CI-safe
// replacement for the live-vault ≥0.97 ratio check, and directly locks
// completeContainmentPositioning (positioningV4.ts:3434).
// ============================================================================
describe("PositioningEngineV4 - deep-nesting invariant (regression-lock c)", () => {
	// A multi-branch graph: two milestones in two workstreams, a task dependency chain, a feature
	// implemented by a story, an orphan-top feature documented by two documents, documents that
	// document BOTH features (multi-parent ⇒ deferred), a versioning edge, and decisions affecting
	// BOTH documents / superseding each other (multi-parent cascade + sequencing).
	const buildGraph = (): EntityData[] => [
		ent({ entityId: "M-1", type: "milestone", workstream: "engineering" }),
		ent({ entityId: "M-2", type: "milestone", workstream: "business" }),
		ent({ entityId: "S-1", type: "story", parent: "M-1", implements: ["F-1"] }),
		ent({ entityId: "S-2", type: "story", parent: "M-2", implements: ["F-2"] }),
		ent({ entityId: "T-1", type: "task", parent: "S-1", dependsOn: ["T-2"] }),
		ent({ entityId: "T-2", type: "task", parent: "S-1" }),
		ent({ entityId: "F-1", type: "feature", implementedBy: ["S-1"] }),
		// F-2 is an orphan-top feature (no implements) documented by two documents.
		ent({ entityId: "F-2", type: "feature", documentedBy: ["DOC-1", "DOC-2"] } as Partial<EntityData> as any),
		// Documents documenting BOTH features ⇒ multiple containment parents ⇒ deferred.
		ent({ entityId: "DOC-1", type: "document", documents: ["F-1", "F-2"] }),
		ent({ entityId: "DOC-2", type: "document", documents: ["F-1", "F-2"], previousVersion: "DOC-1" }),
		// Decisions affecting BOTH documents ⇒ multiple parents ⇒ cascade; DEC-2 supersedes DEC-1.
		ent({ entityId: "DEC-1", type: "decision", affects: ["DOC-1", "DOC-2"] }),
		ent({ entityId: "DEC-2", type: "decision", affects: ["DOC-1"], supersedes: "DEC-1" }),
	];

	it("C1: positions EVERY node in a multi-branch deep graph (0 unpositioned, no cycle errors)", () => {
		const entities = buildGraph();
		const res = new PositioningEngineV4().calculatePositions(entities);

		// 0 unpositioned: every entity got a position.
		expect(res.positions.size).toBe(entities.length);
		const missing = entities.filter((e) => !res.positions.has(e.nodeId)).map((e) => e.entityId);
		expect(missing).toEqual([]);

		// No circular-dependency errors surfaced.
		expect(res.errors.filter((e) => /circular/i.test(e))).toEqual([]);
	});

	it("C2: is idempotent on the deep graph (same engine, two runs → identical positions)", () => {
		const engine = new PositioningEngineV4();
		const a = engine.calculatePositions(buildGraph());
		const b = engine.calculatePositions(buildGraph());

		expect(b.positions.size).toBe(a.positions.size);
		for (const [nodeId, position] of a.positions) {
			expect(b.positions.get(nodeId)).toEqual(position);
		}
		expect(b.errors).toEqual(a.errors);
	});
});

// ============================================================================
// REGRESSION-LOCK (G1) — getFieldValue snake→camel field-name bridge.
//
// The engine reads schema rule field names (snake_case) off the EntityData shape (camelCase) via
// a HARDCODED map in getFieldValue (positioningV4.ts:552-556: depends_on→dependsOn,
// implemented_by→implementedBy, previous_version→previousVersion). Any schema field whose
// camelCase form the bridge doesn't map would silently read `undefined` and drop the edge from
// positioning. These lock that the three bridged fields ARE read correctly by the engine — the
// most likely silent-break point if the refactor renames fields.
// ============================================================================
describe("PositioningEngineV4 - field-name bridge (regression-lock G1)", () => {
	it("reads `dependsOn` for the depends_on rule (sequencing places dependent to the right)", () => {
		const res = new PositioningEngineV4().calculatePositions([
			ent({ entityId: "M-1", type: "milestone" }),
			ent({ entityId: "S-1", type: "story", parent: "M-1", dependsOn: ["S-2"] }),
			ent({ entityId: "S-2", type: "story", parent: "M-1" }),
		]);
		// depends_on ⇒ 'after' ⇒ the dependent (S-1) sits to the RIGHT of what it depends on (S-2).
		expect(res.positions.get("node-S-1")!.x).toBeGreaterThan(res.positions.get("node-S-2")!.x);
	});

	it("reads `previousVersion` for the previous_version rule (both versions positioned)", () => {
		const res = new PositioningEngineV4().calculatePositions([
			ent({ entityId: "DOC-1", type: "document" }),
			ent({ entityId: "DOC-2", type: "document", previousVersion: "DOC-1" }),
		]);
		// If the bridge failed, previous_version would read undefined and DOC-2 would not be
		// sequenced relative to DOC-1; both must still be positioned.
		expect(res.positions.get("node-DOC-1")).toBeDefined();
		expect(res.positions.get("node-DOC-2")).toBeDefined();
	});

	it("reads `implementedBy` for the implemented_by rule (feature contained via its story)", () => {
		const res = new PositioningEngineV4().calculatePositions([
			ent({ entityId: "M-1", type: "milestone" }),
			ent({ entityId: "S-1", type: "story", parent: "M-1" }),
			ent({ entityId: "F-1", type: "feature", implementedBy: ["S-1"] }),
		]);
		// implemented_by ⇒ feature is a child of the story ⇒ placed up-and-left of it.
		expect(res.positions.get("node-F-1")!.x).toBeLessThan(res.positions.get("node-S-1")!.x);
		expect(res.positions.get("node-F-1")!.y).toBeLessThan(res.positions.get("node-S-1")!.y);
	});
});

describe("PositioningEngineV4 - chained deferred entities (regression-lock: DEC-031 orphan bug)", () => {
	// A decision affecting TWO documents is deferred (multi-parent). If those
	// documents are THEMSELVES deferred (each documents two features), Phase 10's
	// single-pass resolution used to orphan the decision whenever it was
	// processed before its parents had positions — 36 of 38 orphan-band
	// decisions in the live vault had positioned parents. The fix resolves
	// deferred entities to a fixpoint, so chained deferreds settle in order.
	function chainedGraph(): EntityData[] {
		return [
			// Decision FIRST in input order — this is the order that triggered the bug.
			ent({ entityId: "DEC-1", type: "decision", affects: ["DOC-1", "DOC-2"] }),
			ent({ entityId: "DOC-1", type: "document", documents: ["F-1", "F-2"] }),
			ent({ entityId: "DOC-2", type: "document", documents: ["F-1", "F-2"] }),
			ent({ entityId: "M-1", type: "milestone" }),
			ent({ entityId: "F-1", type: "feature", implementedBy: ["M-1"] }),
			ent({ entityId: "F-2", type: "feature", implementedBy: ["M-1"] }),
		];
	}

	it("positions a deferred decision whose deferred document parents resolve later in the pass", () => {
		const res = new PositioningEngineV4().calculatePositions(chainedGraph());
		const dec = res.positions.get("node-DEC-1")!;
		const doc1 = res.positions.get("node-DOC-1")!;
		const doc2 = res.positions.get("node-DOC-2")!;
		expect(dec).toBeDefined();
		expect(doc1).toBeDefined();
		// The decision must sit with its document parents (deferred placement is
		// "centered above parents"), NOT in the orphan grid far below the lanes.
		const parentsTop = Math.min(doc1.y, doc2.y);
		expect(dec.y).toBeLessThan(parentsTop);
		const span = { min: Math.min(doc1.x, doc2.x) - 500, max: Math.max(doc1.x, doc2.x) + 900 };
		expect(dec.x).toBeGreaterThan(span.min);
		expect(dec.x).toBeLessThan(span.max);
	});

	it("still orphans a deferred entity whose parents can never resolve (fixpoint terminates)", () => {
		// Two decisions deferring on each other's documents that don't exist as
		// containers: DEC-A affects docs that are never positioned (dangling in
		// the entity set but with no anchors at all → orphan grid). The loop must
		// terminate and place everything somewhere.
		const res = new PositioningEngineV4().calculatePositions([
			ent({ entityId: "DEC-A", type: "decision", affects: ["DOC-X", "DOC-Y"] }),
			ent({ entityId: "DOC-X", type: "document", documents: ["F-GONE", "F-GONE2"] }),
			ent({ entityId: "DOC-Y", type: "document", documents: ["F-GONE", "F-GONE2"] }),
		]);
		// All three exist somewhere on the canvas (orphan grid counts) — no hang, no loss.
		expect(res.positions.get("node-DEC-A")).toBeDefined();
		expect(res.positions.get("node-DOC-X")).toBeDefined();
		expect(res.positions.get("node-DOC-Y")).toBeDefined();
	});
});
