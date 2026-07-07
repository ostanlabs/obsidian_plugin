# Session Report — Plugin ⇄ MCP Unification & Coverage

_Autonomous run: repo-wide duplication/inconsistency analysis, refactor design +
safe execution, comprehensive testing, positioning preserved & schema-configurable._

## 1. What was done (headline)

- **Analyzed the whole repo** (plugin `main.ts`/`util`/`ui`/`notion` vs MCP `mcp.ts` +
  shared `entity-core`) and produced a full **duplication/inconsistency map**
  (`scratchpad/dup-inconsistency-map.md`) and a **unification refactor design**
  (`docs/UNIFICATION_REFACTOR_PLAN.md`).
- **Executed the safe unifications** (behavior-preserving): unified entity **filename
  logic** onto one shared snake_case sanitizer; **deleted ~2,100 LOC of dead duplicate
  code** (`positioningV3.ts` + the uncalled `repositionCanvasNodesV3()` + dead
  `notion/contentSync.ts`).
- **Massively expanded tests** and **locked positioning** with a regression suite.
- **Preserved positioning/containment** and kept it schema-configurable (P1–P7 from the
  prior phase remain intact and are now regression-locked).
- **Surfaced 3 pre-existing bugs** (documented below, not auto-fixed).

Full suite green throughout: **jest ~450, vitest 197, MCP integration 79**; `tsc`
clean; `build:plugin` + `build:mcp` OK. Everything committed incrementally.

## 2. Coverage (comprehensive testing toward 85%)

**"85% of everything" is not achievable** — ~40% of the repo is Obsidian canvas/DOM/menu
glue in `main.ts` (~8,000 LOC across `populateCanvasFromVault`/`repositionCanvasNodes*`
/UI) or dead code, which can only be exercised by simulating Obsidian's entire canvas
renderer. The meaningful target is **85% of the testable surface**.

| Area | Before session start | After |
|---|--:|--:|
| `src/entity-core/**` | 74.7% | **97%** |
| `util/**` | 41% | **~90%** |
| `mcp.ts` | 0% | **92%** |
| `main.ts` | 0% | **16.6%** (all reachable vault-I/O flows) |
| adapters + facade | 0% | **~95%** (facade 100%, entity-index-adapter 100%, vault-adapter 93%) |
| **Whole-repo weighted** | ~25% | **~44%** |
| **Testable surface** (excl. UI/Notion + ~8k main.ts canvas glue) | ~45% | **~81.5%** |

Test count grew from ~62 at session start to ~**774** (jest 498 + vitest 197 + MCP integration 79).
We landed at **~81.5% of the testable surface** — just short of 85%; closing the last few
points is more `main.ts` reachable-flow tests + `positioningV4` branch coverage
(diminishing returns).
The obsidian-mock harness (`tests/harness/obsidian-mock.ts`) is the key enabler — it lets
jest load `main.ts` and drive its vault-I/O flows against an in-memory vault.

**To reach 85% of the testable surface** (~+1 day): more `main.ts` vault-I/O flows +
finishing adapters. The canvas/DOM glue is the hard ceiling and is best verified by
running the plugin, not by mocking the renderer.

## 3. Duplications & inconsistencies (the refactor)

The delegation seam already exists (`EntityCoreFacade`, `main.ts:9406`) but the plugin
calls only `allocateId`; parse/serialize/validate/relationship-graph/path-resolver are
present-but-unused. So unification is mostly "call the facade" — **the risk is entirely
in output divergences** that would reformat or relocate real vault files.

**Done (safe):** filename sanitization (snake_case, shared); dead-code deletion;
workstream aliasing + schema single-source (prior).

**Designed, needs your decision (Phase B/C in `UNIFICATION_REFACTOR_PLAN.md`):**
1. **Serializer canonicalization** — plugin writes inline-JSON arrays + unquoted scalars;
   entity-core writes quoted scalars + YAML block arrays. Adopting `EntitySerializer`
   reformats every file **but eliminates the whole YAML-sanitization bug class**. _Decision:
   adopt EntitySerializer + model plugin-only fields as passthrough?_
2. **Relationship reconciliation** — plugin uses a hardcoded inverse map (incl. deprecated
   `enables`), additive-only, and **breaks cycles by deleting edges**; entity-core is
   schema-derived, add+remove, and rejects cycles. _Decision: adopt `syncBidirectional`;
   keep a plugin-side cycle-breaker?_
3. **Path/folder layout** — plugin routes to `milestones/`; entity-core to
   `entities/milestones/`. _This is a data fact to confirm against the production vault._
4. **Status normalization** — plugin coerces (but mishandles feature statuses);
   entity-core rejects. _Decision: shared schema-driven coercion; coerce on MCP write too?_
5. **Entity model + index** (architectural) — 4+ entity shapes; canonical = `RuntimeEntity`
   + `ProjectIndex`.

These **rewrite vault files** (format/inverse fields/location) and encode product
decisions, so — like the filename rename migration — they are designed + test-guarded
here but **not run unattended on your live vault**.

## 4. Positioning & containment (preserved + configurable)

- Intact and schema-driven; now **regression-locked** (`tests/positioning-config.test.ts`
  + derivation-snapshot + deep-nesting-0-unpositioned invariant) so no refactor can
  silently change layout. Architecture doc: `docs/POSITIONING_ARCHITECTURE.md`.
- **Finding — 3 schema knobs are derived but NOT consumed by layout** (inert config):
  - rule **`priority`** — containment conflict resolution uses ancestry/entityId order, not priority.
  - **`documented_by`/`decided_by` parent rules** (`emitParentRule`) — the reverse fields
    aren't readable by the engine's `getFieldValue`, so those rules are dead (deep nesting
    still works via the child-side rules + Phase 12.5).
  - **`crossWsPositioning`** — derived onto rules but never read for placement.
  These should be **wired into layout or dropped** from the schema surface to make
  "configurable via schema" fully true. Recommended as a bounded follow-up.

## 5. Pre-existing bugs surfaced (documented, not auto-fixed)

1. **`mcp.ts reconcile_relationships` write mode under-reconciles** — for parent→children
   and depends_on→blocks drift it reports "Add X" and sets `modified=true` but writes the
   *child/source* entity, never mutating the *parent's* `children` / dependency's `blocks`.
   Only the removal branches persist. A real correctness bug in a core tool (ties to
   refactor §3). _Behavior-changing fix — recommend doing with the reconciliation unification._
2. **`entity-core canvas.ts addNode()`** looks up the folder by ID prefix (`'M'`) against a
   type-name-keyed map → always throws under `DEFAULT_SCHEMA`. **Latent** (only the facade's
   `CanvasManager` wraps it; the plugin uses `util/canvas`, so it's effectively unused in
   production). Low severity; easy fix (resolve folder by prefix→type).
3. **`main.ts reconcileAllRelationships` keeps non-ID-shaped garbage** — a malformed
   relationship token (e.g. free text) is dropped at read-time by `cleanEntityId`, so the
   file reads "already clean" and the garbage is never pruned from disk. Only valid-shaped
   dangling refs get pruned.
4. **`EntityIndexAdapter.buildAdjacency` emits duplicate edges** — field names collected
   as `rel.pairs.map(p => p.forward)` without de-dup, so a relationship with N same-named
   pairs (dependency=3× `depends_on`, hierarchy=2× `parent`) emits each target N times.
   Benign for visited-guarded cycle/reachability queries, but the adjacency list is wrong.
5. **`EntityIndexAdapter.buildAdjacency` spreads scalar `parent` into characters** — it
   treats every field as `string[]` and does `targets.push(...value)`, so scalar
   `parent: 'M-001'` becomes `['M','-','0','0','1']`. **Any hierarchy cycle check via this
   adapter is garbage.** Latent today (plugin calls only `allocateId`), but it bites the
   moment cycle detection is routed through the facade — fix before the reconciliation
   unification (refactor §3).

## 6. Decisions I need from you (to unblock Phase B/C)

1. Canonical serializer: adopt entity-core's always-quote/block-array `EntitySerializer`
   everywhere (one-time reformat of all files)?
2. Cycle policy: keep the plugin's destructive auto-heal, or move to entity-core's
   reject-only + a bounded cycle-breaker?
3. Vault layout: bare `milestones/` or `entities/milestones/`? (Confirm against prod vault.)
4. Coerce-on-write for MCP status, or keep reject-only?
5. Run the one-time **filename rename migration** on the live vault (with backup) to
   converge existing files to snake_case?
6. Should I fix the 3 bugs above (esp. #1 reconcile write) now, or bundle with the refactor?

## 7. Commits (this run)

Filename unification → dead-code deletion → positioning regression-lock + coverage
(mcp/util) → main.ts vault-I/O coverage → adapters/facade coverage → this report. All on
the submodule `main` branch with the parent pointer updated per step. Nothing pushed.
