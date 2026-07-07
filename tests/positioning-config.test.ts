/**
 * REGRESSION-LOCK (b) + (d) — config → layout locks for PositioningEngineV4.
 *
 * These are the central missing safety net for the unification refactor: they inject a
 * CUSTOM schema's `positioning` metadata into the engine (via
 * buildRelationshipRules(customSchema)) and assert that changing that metadata changes the
 * PRODUCED LAYOUT — not just the derived rules. Each case asserts BOTH the derived rule and a
 * position delta from result.positions.
 *
 * The engine still hardcodes the six built-in entity-type NAMES (milestone == root container,
 * "everything-but-milestone infers containment", the closed EntityType union — see the audit
 * §2b). So these tests reuse the real type names and vary only the `positioning` metadata; that
 * is exactly the schema-configurable surface the refactor must preserve.
 *
 * Two cases from the spec are NOT position-delta tests, by design, because the current engine
 * does not consume the corresponding flag for final layout (documented inline):
 *   - B2 (priority): the priority-sorted containment winner is re-resolved by
 *     resolveParentConflict / multi-parent deferral, which ignore rule priority. Locked at the
 *     derivation level here; flagged to the refactor.
 */
import {
  PositioningEngineV4,
  EntityData,
  EntityType,
  RelationshipRule,
  DEFAULT_POSITIONING_CONFIG,
} from "../util/positioningV4";
import { buildRelationshipRules } from "../src/entity-core/schema-derivation";
import { DEFAULT_SCHEMA } from "../src/entity-core/default-schema";
import type { Schema } from "../src/entity-core/types";

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

function ent(p: Partial<EntityData> & { entityId: string; type: EntityType; workstream?: string }): EntityData {
  return {
    nodeId: `node-${p.entityId}`,
    workstream: p.workstream ?? "engineering",
    dependsOn: [], blocks: [], enables: [], affects: [],
    implementedBy: [], implements: [], documents: [],
    filePath: `${p.entityId}.md`,
    ...p,
  } as EntityData;
}

// Minimal schema skeleton; only `relationships` (+ optional overlap order) matter for derivation.
const base = {
  schemaVersion: 1,
  settings: { overlapPriorityOrder: DEFAULT_SCHEMA.settings.overlapPriorityOrder },
  entityTypes: [],
  workstreams: {},
} as unknown as Schema;

/** Build an engine wired to a custom schema's derived rules + overlap order (mirrors main.ts:8661). */
function engineFor(schema: Schema): PositioningEngineV4 {
  return new PositioningEngineV4({
    relationshipRules: buildRelationshipRules(schema) as RelationshipRule[],
    overlapPriorityOrder:
      (schema.settings.overlapPriorityOrder as EntityType[]) ??
      DEFAULT_POSITIONING_CONFIG.overlapPriorityOrder,
  });
}

const derived = (schema: Schema) =>
  buildRelationshipRules(schema).filter((r) => r.field !== "workstream");
const findRule = (schema: Schema, sourceType: string, field: string) =>
  derived(schema).find((r) => r.sourceType === sourceType && r.field === field);
const pos = (res: { positions: Map<string, { x: number; y: number }> }, id: string) =>
  res.positions.get(`node-${id}`)!;

describe("PositioningEngineV4 — config → layout locks", () => {
  // -------------------------------------------------------------------------
  // B1 — flipping `containerEnd` inverts containment (derived rule AND layout).
  //
  // Same two entities (a story and a feature) linked by one implementation-style relationship
  // whose forward/reverse fields (`implements` / `implemented_by`) are BOTH readable by the
  // engine. Flipping containerEnd swaps which entity is the container. Children are placed LEFT
  // of their parent, so the sign of (feature.x - story.x) must invert between the two cases.
  // -------------------------------------------------------------------------
  describe("B1: containerEnd flips containment direction", () => {
    const schema = (containerEnd: "from" | "to"): Schema => ({
      ...base,
      relationships: [{
        name: "impl", label: "Impl",
        pairs: [{ from: "story", to: "feature", forward: "implements", reverse: "implemented_by" }],
        cardinality: { forward: "many", reverse: "many" }, canvas: {}, graph: {},
        positioning: { role: "containment", containerEnd, priority: 1 },
      }],
    } as unknown as Schema);

    it("containerEnd:'to' → feature is container, story nests inside (left of it)", () => {
      const s = schema("to");
      // derived child rule: story.implements → feature (story is the child)
      expect(findRule(s, "story", "implements")).toMatchObject({
        targetType: "feature", action: "containment", direction: "child",
      });
      const res = engineFor(s).calculatePositions([
        ent({ entityId: "S-1", type: "story", implements: ["F-1"] }),
        ent({ entityId: "F-1", type: "feature" }),
      ]);
      // child (story) is LEFT of its container (feature)
      expect(pos(res, "S-1").x).toBeLessThan(pos(res, "F-1").x);
    });

    it("containerEnd:'from' → story is container, feature nests inside (left of it)", () => {
      const s = schema("from");
      // derived child rule flips: feature.implemented_by → story (feature is now the child)
      expect(findRule(s, "feature", "implemented_by")).toMatchObject({
        targetType: "story", action: "containment", direction: "child",
      });
      const res = engineFor(s).calculatePositions([
        ent({ entityId: "S-1", type: "story" }),
        ent({ entityId: "F-1", type: "feature", implementedBy: ["S-1"] }),
      ]);
      // nesting inverted: feature is now LEFT of story
      expect(pos(res, "F-1").x).toBeLessThan(pos(res, "S-1").x);
    });
  });

  // -------------------------------------------------------------------------
  // B2 — `priority` drives the containment-winner SORT (schema → rule).
  //
  // NOTE (engine finding for the refactor): the priority-sorted winner in
  // processContainmentRelationships (positioningV4.ts:581-585) is re-resolved by
  // resolveParentConflict (ancestry / same-ws-milestone entityId order) or deferred to a
  // symmetric multi-parent band — neither reads rule priority. So swapping priority does NOT
  // change the FINAL position of a two-parent entity, and a position-delta assertion is
  // intentionally omitted (it would assert a no-op, like the crossWs flag in D2). What IS
  // schema-driven — and what a refactor could silently break — is that `priority` flows from
  // schema positioning.priority onto the derived child rules; that is locked here, plus the
  // invariant that both priority orderings still fully position every entity.
  // -------------------------------------------------------------------------
  describe("B2: priority flows schema → derived child rules", () => {
    const schema = (pParent: number, pImpl: number): Schema => ({
      ...base,
      relationships: [
        { name: "h", label: "H",
          pairs: [{ from: "story", to: "milestone", forward: "parent", reverse: "children" }],
          cardinality: { forward: "one", reverse: "many" }, canvas: {}, graph: {},
          positioning: { role: "containment", containerEnd: "to", priority: pParent } },
        { name: "impl", label: "I",
          pairs: [{ from: "story", to: "milestone", forward: "implements", reverse: "implemented_by" }],
          cardinality: { forward: "many", reverse: "many" }, canvas: {}, graph: {},
          positioning: { role: "containment", containerEnd: "to", priority: pImpl } },
      ],
    } as unknown as Schema);

    const entities = () => [
      ent({ entityId: "M-eng", type: "milestone", workstream: "engineering" }),
      ent({ entityId: "M-biz", type: "milestone", workstream: "business" }),
      ent({ entityId: "X-1", type: "story", parent: "M-eng", implements: ["M-biz"] }),
    ];

    it("swapping schema priority swaps the derived rule priority", () => {
      const a = schema(1, 2);
      expect(findRule(a, "story", "parent")!.priority).toBe(1);
      expect(findRule(a, "story", "implements")!.priority).toBe(2);
      const b = schema(2, 1);
      expect(findRule(b, "story", "parent")!.priority).toBe(2);
      expect(findRule(b, "story", "implements")!.priority).toBe(1);
    });

    it("both priority orderings still position every entity (no drop / crash)", () => {
      for (const s of [schema(1, 2), schema(2, 1)]) {
        const res = engineFor(s).calculatePositions(entities());
        expect(res.positions.size).toBe(3);
        expect(res.errors).toEqual([]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // B3 — toggling `emitParentRule` changes attachment of an orphan-top container's child.
  //
  // A container (story) claims a child (feature) via the PARENT-side rule alone: the feature
  // carries NO `implemented_by`, so its only path to a home is the story's `implements` claim.
  // emitParentRule:true derives that parent rule → feature nests inside the story. false → no
  // rule reaches the feature → it falls through to the orphan area. Positions must differ.
  // (The spec's documentation example, feature.documented_by, cannot be used: `documented_by`
  //  is unreadable by getFieldValue — see G1 — so its parent rule is dead. `implements` is a
  //  readable field, so it exercises the same emitParentRule mechanism.)
  // -------------------------------------------------------------------------
  describe("B3: emitParentRule toggles parent-side attachment", () => {
    const schema = (emitParentRule: boolean): Schema => ({
      ...base,
      relationships: [
        { name: "h", label: "H",
          pairs: [{ from: "story", to: "milestone", forward: "parent", reverse: "children" }],
          cardinality: { forward: "one", reverse: "many" }, canvas: {}, graph: {},
          positioning: { role: "containment", containerEnd: "to" } },
        { name: "impl", label: "I",
          pairs: [{ from: "story", to: "feature", forward: "implements", reverse: "implemented_by" }],
          cardinality: { forward: "many", reverse: "many" }, canvas: {}, graph: {},
          positioning: { role: "containment", containerEnd: "from", priority: 1, emitParentRule } },
      ],
    } as unknown as Schema);

    // Feature carries NO implementedBy; only the story carries `implements`.
    const entities = () => [
      ent({ entityId: "M-1", type: "milestone" }),
      ent({ entityId: "S-1", type: "story", parent: "M-1", implements: ["F-1"] }),
      ent({ entityId: "F-1", type: "feature" }),
    ];

    it("emitParentRule:true derives the parent rule → feature nests inside the story", () => {
      const s = schema(true);
      expect(findRule(s, "story", "implements")).toMatchObject({
        targetType: "feature", action: "containment", direction: "parent",
      });
      const res = engineFor(s).calculatePositions(entities());
      // contained: feature placed up-and-left of its claiming container (story)
      expect(pos(res, "F-1").x).toBeLessThan(pos(res, "S-1").x);
      expect(pos(res, "F-1").y).toBeLessThan(pos(res, "S-1").y);
    });

    it("emitParentRule:false suppresses the parent rule → feature falls to the orphan area", () => {
      const s = schema(false);
      expect(findRule(s, "story", "implements")).toBeUndefined();
      const res = engineFor(s).calculatePositions(entities());
      // orphan: NOT nested left of the story — it lands to the right / below (orphan area)
      expect(pos(res, "F-1").x).toBeGreaterThan(pos(res, "S-1").x);
      expect(pos(res, "F-1").y).toBeGreaterThan(pos(res, "S-1").y);
    });

    it("the two toggles produce different feature positions", () => {
      const on = engineFor(schema(true)).calculatePositions(entities());
      const off = engineFor(schema(false)).calculatePositions(entities());
      expect(pos(on, "F-1")).not.toEqual(pos(off, "F-1"));
    });
  });

  // -------------------------------------------------------------------------
  // B4 — toggling `emitReverseRule` changes sequencing-driven categorization.
  //
  // B carries ONLY the reverse field (`blocks` → A). With emitReverseRule:true the reverse rule
  // (blocks → before) is derived, giving B a sequencing constraint → B is categorized FLOATING
  // (placed above its target's workstream). With false, `blocks` is read by no rule → B has no
  // relationships → it is an ORPHAN (placed below all content). Position must differ.
  // -------------------------------------------------------------------------
  describe("B4: emitReverseRule toggles reverse sequencing", () => {
    const schema = (emitReverseRule: boolean): Schema => ({
      ...base,
      relationships: [
        { name: "h", label: "H",
          pairs: [{ from: "story", to: "milestone", forward: "parent", reverse: "children" }],
          cardinality: { forward: "one", reverse: "many" }, canvas: {}, graph: {},
          positioning: { role: "containment", containerEnd: "to" } },
        { name: "dep", label: "Dep",
          pairs: [{ from: "story", to: "story", forward: "depends_on", reverse: "blocks" }],
          cardinality: { forward: "many", reverse: "many" }, canvas: {}, graph: {},
          positioning: { role: "sequencing", forwardDirection: "after", emitReverseRule } },
      ],
    } as unknown as Schema);

    const entities = () => [
      ent({ entityId: "M-1", type: "milestone" }),
      ent({ entityId: "A-1", type: "story", parent: "M-1" }),
      ent({ entityId: "B-1", type: "story", blocks: ["A-1"] }), // only the reverse field, no parent
    ];

    it("emitReverseRule:true derives the reverse rule → B floats above its target's workstream", () => {
      const s = schema(true);
      expect(findRule(s, "story", "blocks")).toMatchObject({
        action: "sequencing", direction: "before",
      });
      const res = engineFor(s).calculatePositions(entities());
      // floating: B is placed ABOVE the milestone lane (smaller y)
      expect(pos(res, "B-1").y).toBeLessThan(pos(res, "M-1").y);
    });

    it("emitReverseRule:false suppresses the reverse rule → B is an orphan below content", () => {
      const s = schema(false);
      expect(findRule(s, "story", "blocks")).toBeUndefined();
      const res = engineFor(s).calculatePositions(entities());
      // orphan: B is placed BELOW the milestone lane (larger y)
      expect(pos(res, "B-1").y).toBeGreaterThan(pos(res, "M-1").y);
    });

    it("the two toggles produce different B positions", () => {
      const on = engineFor(schema(true)).calculatePositions(entities());
      const off = engineFor(schema(false)).calculatePositions(entities());
      expect(pos(on, "B-1")).not.toEqual(pos(off, "B-1"));
    });
  });

  // -------------------------------------------------------------------------
  // D1 — `overlapPriorityOrder` (from schema settings) decides which node moves on overlap.
  //
  // Two floating entities of different types (a story and a task) both depend on the same target
  // in the same workstream, so the layout places them at IDENTICAL coordinates → they overlap.
  // resolveNodeOverlapWithPriority (positioningV4.ts:3388) then moves the LOWER-priority type
  // vertically. Reversing overlapPriorityOrder must swap which node is moved.
  // -------------------------------------------------------------------------
  describe("D1: overlapPriorityOrder decides the moved node", () => {
    const schema = (order: EntityType[]): Schema => ({
      ...base,
      settings: { overlapPriorityOrder: order },
      relationships: [
        { name: "h", label: "H",
          pairs: [{ from: "story", to: "milestone", forward: "parent", reverse: "children" }],
          cardinality: { forward: "one", reverse: "many" }, canvas: {}, graph: {},
          positioning: { role: "containment", containerEnd: "to" } },
        { name: "dep", label: "Dep",
          pairs: [
            { from: "story", to: "story", forward: "depends_on", reverse: "blocks" },
            { from: "task", to: "story", forward: "depends_on", reverse: "blocks" },
          ],
          cardinality: { forward: "many", reverse: "many" }, canvas: {}, graph: {},
          positioning: { role: "sequencing", forwardDirection: "after", emitReverseRule: true } },
      ],
    } as unknown as Schema);

    const entities = () => [
      ent({ entityId: "M-1", type: "milestone" }),
      ent({ entityId: "S-1", type: "story", parent: "M-1" }),
      ent({ entityId: "A-1", type: "story", dependsOn: ["S-1"] }), // floating story, no parent
      ent({ entityId: "B-1", type: "task", dependsOn: ["S-1"] }),  // floating task, no parent
    ];

    it("order [story, task] → the task (lower priority) is moved off the shared spot", () => {
      const res = engineFor(schema(["story", "task"] as EntityType[])).calculatePositions(entities());
      // same x (they were placed on top of each other), but the task was pushed DOWN
      expect(pos(res, "A-1").x).toBe(pos(res, "B-1").x);
      expect(pos(res, "B-1").y).toBeGreaterThan(pos(res, "A-1").y); // task moved, story fixed
    });

    it("order [task, story] → the story (now lower priority) is moved instead", () => {
      const res = engineFor(schema(["task", "story"] as EntityType[])).calculatePositions(entities());
      expect(pos(res, "A-1").x).toBe(pos(res, "B-1").x);
      expect(pos(res, "A-1").y).toBeGreaterThan(pos(res, "B-1").y); // story moved, task fixed
    });

    it("reversing the order swaps which node moves", () => {
      const r1 = engineFor(schema(["story", "task"] as EntityType[])).calculatePositions(entities());
      const r2 = engineFor(schema(["task", "story"] as EntityType[])).calculatePositions(entities());
      // the moved (larger-y) node is the task in r1 and the story in r2
      expect(pos(r1, "B-1").y).toBeGreaterThan(pos(r1, "A-1").y);
      expect(pos(r2, "A-1").y).toBeGreaterThan(pos(r2, "B-1").y);
    });
  });
});
