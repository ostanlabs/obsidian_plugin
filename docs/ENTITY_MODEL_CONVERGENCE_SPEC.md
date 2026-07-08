# Spec — Entity Model + Parse + Index Convergence (§1 / §8 / §5)

**Status:** In progress. **Owner:** TBD. **Risk:** High (architectural, touches the
untested `main.ts`, 10,899 lines). **Prereqs met:** schema single-source, positioning
regression-lock, unified filenames/serializer/reconciler, obsidian-mock harness — all done.

This is the last large piece of the plugin ⇄ MCP unification. It is the *framing* refactor
the remaining duplication rides on: collapse the plugin's parallel entity model, parsers, and
index onto the shared `entity-core` types (`RuntimeEntity` + `EntityMetadata` + `ProjectIndex`),
so there is **one** in-memory representation of an entity and **one** index across the plugin
and MCP.

---

## 1. Motivation

The `EntityCoreFacade` seam exists (`main.ts:9187`) and exposes `parseEntity`, `serializeEntity`,
`validateEntity`, `allocateId`, `generateFilename`, `getTypeFolderPath`, `getSchema`,
`initializeWithIndex`, and `getRelationshipGraph`. The plugin calls only the wiring
methods — `getSchema` (`main.ts:9199`) and `initializeWithIndex` (`main.ts:9203`) — plus a
single engine operation: `allocateId` (`main.ts:9254`). Everything else still runs the
plugin's `util/*` twin. The remaining duplication is not "missing engine code" — it is
**five-plus parallel shapes for 'an entity'** plus three parser families plus a second index.
Unifying them removes the last class of drift bugs (camelCase↔snake_case, dropped passthrough
keys, hardcoded relationship-field lists) and lets the plugin inherit `entity-core` — whose
parse/serialize path is well-tested (parser 91%, serializer 95%) and whose index/allocator/
registry layer is pinned at 99-100% line coverage as of Phase 2a (see §2a).

## 2. Current state (what diverges)

### §8 — Five+ entity shapes
| Model | File | Shape | Relationship keys |
|---|---|---|---|
| `EntityData` | `util/positioningV4.ts:57-73` (built by `util/entityParser` `parseEntityFromFrontmatter`) | positioning input | **camelCase** (`dependsOn`, `implementedBy`, `previousVersion`) |
| `ItemFrontmatter` / `FeatureFrontmatter` | `types.ts:98-161` | flat frontmatter + plugin-only fields (`inProgress`, `created_by_plugin`, `notion_page_id`); `priority` is **required** (`types.ts:104`) | snake_case, typed optional arrays |
| `EntityIndexEntry` | `util/entityNavigator.ts:44-62` | index entry holding a `TFile` | hardcoded snake_case field set, non-optional arrays defaulting `[]` |
| `EntityFrontmatter` | `util/entityNavigator.ts:22-41` | loose all-optional DTO over raw `metadataCache` frontmatter, used by `indexFile()` | snake_case, all optional |
| `RuntimeEntity` (`Entity<T>`) | `src/entity-core/types.ts:197-212` | `system` + `fields` + `relationships` + `passthrough` | schema-driven `relationships` map |
| `EntityMetadata` | `src/entity-core/types.ts:218-263` | flat index metadata (`parent_id`, `children_count`, optional `priority`) | — |

Divergences: camelCase vs snake_case relationship keys; plugin-only system fields
(`inProgress`, `created_by_plugin`, `notion_page_id`) absent from `BaseEntity` — in
entity-core they survive only via `RuntimeEntity.passthrough` (`types.ts:208`, whose doc
comment names them explicitly); `priority` is **required first-class** in `ItemFrontmatter`,
absent from `BaseEntity` entirely, and **optional** in `EntityMetadata` — so any
`toItemFrontmatter()` mapper must synthesize a default.

Positioning also keeps layout-scoped entity maps (`entityMap`, `nodeIdToEntityId`,
`entityIdToNodeId` in `positioningV4.ts`) and `main.ts:111` keeps a `fileEntityIdCache` for
Notion-sync deletion tracking; these are caches over the shapes above, not independent models,
but Phase 5's deletion checklist must not orphan them.

### §1 — Three parser families (plugin) vs one (entity-core)
- **A. `util/entityParser.ts`** `parseEntityFromFrontmatter` — regex line-parsing (no
  `YAML.parse`), → `EntityData` camelCase; coerces unknown type→`task`
  (`entityParser.ts:87-90`), workstream default `'default'` (falls back through legacy
  `effort`). **1 call site:** `main.ts:8396` (canvas positioning). The file also exports
  `stripQuotes` (imported at `main.ts:28`) and `generateNodeIdFromEntityId`
  (`main.ts:85`) — Phase 5 must relocate these before deleting the file.
- **B. `util/frontmatter.ts`** — `parseFrontmatter` (**12 call sites in `main.ts`**: lifecycle
  746, plugin-created checks 838/3566, canvas create 3147, sync/validation 3451/3999,
  reconcile 3649, archive 3710, Notion 4144/4275/4319, V2-style check 5288) and
  `parseAnyFrontmatter` (**6 call sites in `main.ts`** ~8398-8410, plus
  `ui/FeatureDetailsView.ts` ×2, `ui/FeatureCoverageView.ts` ×1,
  `util/relationshipReconciler.ts` ×4) — own value coercion, hardcoded array-field list
  (`frontmatter.ts:237`, 8 fields), legacy-field migration on read (`created`→`created_at`,
  `updated`→`updated_at`, `effort`→`workstream`, lines 259-268). Internal helpers
  `parseFrontmatterLines` (dual-mode), `parseRawFrontmatter`, and `robustSplitFrontmatter`
  (YAML.parse with lenient line-parser fallback) round out the family.
- **C. `parseFrontmatterAndBody`** (`util/frontmatter.ts:306`) — splits frontmatter/body with
  `parseValues: false` so scalars stay raw strings (merge-safe write-back). **1 call site:**
  `main.ts:2925` (structured item modal).
- **D. Direct `metadataCache.getFileCache().frontmatter`** — 3 sites: `main.ts:10251`
  (sanitization pass), `util/idGenerator.ts:53,92` (max-ID scan), `util/entityNavigator.ts:111`
  (index build).
- **entity-core:** `EntityParser.parse` — real `YAML.parse` (`parser.ts:123`), schema-driven
  field/relationship/passthrough separation → `RuntimeEntity`. Only it preserves unknown keys.
  The plugin never calls it (directly or via the facade); it runs only in the MCP (`mcp.ts`).

### §5 — Two indexes
- Plugin: `util/entityNavigator.ts` `EntityIndex` — `Map<string, EntityIndexEntry>`
  (`entityNavigator.ts:82`) off `metadataCache`, hardcoded `ID_PATTERNS` (lines 12-19) +
  relationship fields, linear-scan navigation (e.g. `getChildren` filters all values).
  Public API (~22 methods): `get`, `getFile`, `getByType`, `getAll`, `getParent`,
  `getChildren`, `getDependencies`, `getDependents`, `getImplementedDocuments`,
  `getImplementors`, `getRelatedDecisions`, `getEnabledEntities`, `getFromFile`, plus the
  feature-specific family (`getFeaturesImplementedBy` … `getFeaturesByPhase`).
  **Only `main.ts` consumes it** — `ui/*` and the canvas utils do not import it.
- entity-core: `ProjectIndex implements EntityIndex` (`project-index.ts:63`) — primary map +
  secondary indexes (by_type/status/workstream/parent/canvas, archived, in_progress, priority)
  + forward/reverse relationship graph with schema-derived inverse map
  (`buildReverseRelationMap`, line 78), O(1) typed queries, `buildAdjacency` (line 350).
  MCP runs entirely on it. **Coverage is only ~65%** (§2a) — harden before adopting.
- A transitional shim already exists and is wired: `src/adapters/entity-index-adapter.ts`
  (`EntityIndexAdapter`, used at `main.ts:9199-9203`), including a bridge `buildAdjacency`.

### §2a — entity-core coverage (verified by live `vitest --coverage` run, Phase 2a)
A first audit quoted the on-disk `coverage-tmp` report (~70% weighted, relationship-graph
"19% stub") — that report was **stale**: it predated suites K/A2/E, and the "STUB" file-header
comments in `relationship-graph.ts`/`schema-registry.ts` are leftover TDD-era notes. Live
numbers after Phase 2a (+45 pinning tests in `k2.project-index-extra`,
`e2.id-allocator-extra`, `a3.schema-registry-defaults`):

| Module | Line coverage |
|---|---|
| `project-index.ts` / `id-allocator.ts` | **100% / 100%** |
| `schema-registry.ts` / `relationship-graph.ts` | **99.5% / 99.6%** |
| `serializer.ts` / `parser.ts` | 95% / 91% |

`relationship-graph.ts` is fully implemented; the sole remaining `notImplemented` is
`SchemaRegistry.getValidator` (pinned). Known allocator quirks pinned for Phase 3 awareness:
`allocate()` ignores `reserve()`d ids (`id-allocator.ts:40` vs `:63`) and malformed ids like
`T-007x` are parsed leniently into the max computation (`id-allocator.ts:47-49`).
`repairDuplicates` does not rewrite inbound references (in-code TODO, `id-allocator.ts:139`).

## 3. Goals / non-goals

**Goals**
- One canonical in-memory model: **`RuntimeEntity`** (+ `EntityMetadata` for the index).
- `EntityData` (positioning) and `ItemFrontmatter` (UI/frontmatter) become **projections** of
  `RuntimeEntity`, produced by pure mappers — not independently parsed shapes.
- All plugin **reads** go through `EntityParser`; all **navigation** through `ProjectIndex`.
- Delete `util/entityParser.ts` (after relocating `stripQuotes` /
  `generateNodeIdFromEntityId`), the redundant `util/frontmatter` parsers, and
  `EntityIndexEntry`/`EntityFrontmatter`/`entityNavigator` internals.
- Plugin-only fields (`inProgress`, `created_by_plugin`, `notion_page_id`) survive round-trip
  via `RuntimeEntity.passthrough` (the mechanism entity-core already documents and the
  round-trip corpus already exercises).
- entity-core's index/allocator layer hardened to parser/serializer-grade coverage before the
  plugin depends on it.

**Non-goals**
- No change to the on-disk format (already unified: title-only filenames, quote-when-needed
  serializer, bare folders). No vault migration.
- No change to positioning *behavior* (guarded by the regression-lock).
- No new plugin dependency on `relationship-graph.ts`/`getRelationshipGraph` — navigation
  queries go through `ProjectIndex`'s built-in forward/reverse graph. (Verified: no plugin
  path reaches it today; only `tests/facade.test.ts` calls the getter.)
- No new features; this is pure structural convergence.

## 4. Target architecture

```
                 vault file (frontmatter + body)
                          │  read
                          ▼
                 EntityParser.parse  ──►  RuntimeEntity   ◄── the ONE model
                          │                    │
        ┌─────────────────┼────────────────────┼──────────────────┐
        ▼                 ▼                    ▼                    ▼
  toEntityData()   toItemFrontmatter()   EntityMetadata      EntitySerializer
   (positioning)      (UI / legacy        (→ ProjectIndex)     (write, already
                       frontmatter view)                        unified)
```

- **`RuntimeEntity`** is authoritative. Mappers are pure, total, and covered by round-trip tests
  (`toEntityData(parse(x))` positions identically; `toItemFrontmatter` preserves plugin fields
  and synthesizes the required `priority` default).
- **`ProjectIndex`** is the single index; `entityNavigator`'s existing public methods
  (`getParent`, `getChildren`, `getDependencies`, `getRelatedDecisions`, the feature family, …)
  keep their signatures but become thin queries over it. Since only `main.ts` consumes the
  navigator, the blast radius of Phase 3 is `main.ts` alone.
- The **`EntityCoreFacade`** is the entry point the plugin calls for parse/serialize/index.

## 5. Design details

1. **Plugin-only fields** — `inProgress`, `created_by_plugin`, `notion_page_id` ride
   `RuntimeEntity.passthrough`, which entity-core already documents for exactly these keys and
   `frontmatterRoundTrip.test.ts` already exercises. (Promotion to schema custom fields stays
   an option later; not needed for convergence.) `priority` is already a schema custom field —
   drop its first-class status in the model; `toItemFrontmatter()` synthesizes the default
   (`'Medium'` — the schema field default and the only casing `ItemPriority` admits) the
   required `ItemFrontmatter.priority` demands. Note: task has no schema `priority` field, so
   a parsed task's priority rides passthrough; the projection reads field → passthrough →
   synthesized default.
2. **camelCase ↔ snake_case** — the positioning engine reads camelCase (`dependsOn`) via
   `getFieldValue`'s bridge (`positioningV4.ts:559-580`, currently mapping `depends_on`,
   `implemented_by`, `previous_version`, `documented_by`, `decided_by`). `toEntityData()` owns
   that translation; the on-disk/`RuntimeEntity` side stays snake_case. One translation point,
   tested.
3. **Parser defaults** — reconcile the divergent defaults (unknown type: plugin coerces →
   `task`, entity-core keeps the literal for the validator to reject; workstream: plugin
   `'default'` — with legacy `effort` fallback — vs entity-core's schema-driven
   `'engineering'`). Pick entity-core's and update any plugin code that relied on the old
   coercions.
4. **Index population** — the plugin's vault scan feeds `EntityMetadata` into a `ProjectIndex`
   instead of building `EntityIndexEntry`. `EntityIndexAdapter` stays as the bridge until the
   navigator is fully migrated, then is removed.
5. **UI dependency surface** — `ui/*` does **not** use the navigator; its coupling is
   `parseAnyFrontmatter` + `ItemFrontmatter`/`FeatureFrontmatter` types. Phase 4 is therefore
   a parser/type migration in `ui/*` (and `relationshipReconciler`), not an index migration.

## 6. Phased plan (each phase ships green + committed)

> Guardrails for every phase: `jest` + `vitest` + MCP integration green; `positioning-vault-validation`
> **0 unpositioned**; `build:plugin` + `build:mcp` pass. Expand `main.ts` integration coverage
> (obsidian-mock harness) for each flow *before* touching it — `main.ts` is the untested risk.

- **Phase 0 — Coverage floor. ✅ DONE.** +44 integration tests / 5 new `plugin-*.test.ts`
  suites (17 total) covering all Phase 2 call sites: notion-sync, canvas-create, populate +
  V4 reposition, feature-canvas, note-modal. Includes explicit quirk pins of the legacy
  defaults (`effort`→lane fallback, unknown-type→`task`) that Phase 2 deliberately changes —
  those pins get updated in the same commit as the behavior change, never silently.
- **Phase 1 — Mapper layer (pure, no behavior change). ✅ DONE.** `src/adapters/model-map.ts`:
  `toEntityData` (+`PositioningEntityData` extension carrying `documentedBy`/`decidedBy`,
  relationships-only), `toItemFrontmatter`/`toFeatureFrontmatter`, and
  `fromFrontmatterObject`/`fromItemFrontmatter`/`fromFeatureFrontmatter` (schema-driven,
  mirrors `EntityParser.parse` key-for-key). Non-obvious contract: projections read
  relationship keys as `relationships[key] ?? passthrough[key]` because EntityParser routes
  schema-less keys (deprecated `enables`, feature-side `depends_on`/`blocks`, milestone
  `parent`) into passthrough while the legacy positioning parser read them untyped. 51 tests
  in `tests/model-map.test.ts` (parity corpus, reconciled defaults, camelCase bridge,
  round-trips, priority synthesis). Nothing consumes the mappers yet.
- **Phase 2 — Route reads through `EntityParser`. ✅ DONE** (3 commits). All 20 `main.ts`
  parser call sites now go through `getEntityCore()` (new lazy accessor — facade available
  regardless of init order): the positioning read uses `parseEntity → toEntityData`; the 11
  pure-read `parseFrontmatter` sites use a `parseItemFrontmatter` helper (legacy null
  contract); the 7 `parseAnyFrontmatter` sites use `parseAnyEntityFrontmatter` →
  `toFlatFrontmatter` (new lossless flatten in model-map); `updateLocalFileFromNotion` is a
  full parse→mutate→serialize round-trip (passthrough survives; canonical `updated_at`
  written, legacy `updated` key retired). Reconciled defaults asserted in updated quirk pins.
  `main.ts` no longer imports `parseFrontmatter`/`parseAnyFrontmatter`.
  (`parseFrontmatterAndBody` at its modal site and the 3 direct `metadataCache` reads move in
  Phase 3/4 with their hosts.)
- **Phase 2a — entity-core hardening (gate for Phase 3). ✅ DONE.** `project-index.ts` and
  `id-allocator.ts` at 100%, `schema-registry.ts` 99.5% line coverage; +45 behavior-pinning
  tests (secondary indexes, reverse-relationship map injection/swap, adjacency, allocator
  gap/malformed-id/reservation semantics, registry defaults incl. `engineering`). Verified no
  plugin path reaches `getRelationshipGraph`. Runs in parallel with Phases 0-2.
- **Phase 3 — Adopt `ProjectIndex`.** Feed `EntityMetadata` from the vault scan into a
  `ProjectIndex`; rewrite `entityNavigator`'s public methods as `ProjectIndex` queries; keep
  the same method signatures so the sole consumer (`main.ts`) is unchanged. Retire
  `EntityIndexEntry`/`EntityFrontmatter` internally (via the adapter). Migrate the
  `entityNavigator.ts:111` direct `metadataCache` read as part of the new scan.
- **Phase 4 — Consumers.** Migrate `ui/FeatureDetailsView`, `ui/FeatureCoverageView`,
  `util/relationshipReconciler`, and the structured-item modal path (`parseFrontmatterAndBody`)
  from `parseFrontmatter*`/`ItemFrontmatter` raw parsing to the `RuntimeEntity` projections.
  Migrate the remaining direct `metadataCache` reads (`main.ts:10251`, `idGenerator`).
- **Phase 5 — Delete duplicates.** Relocate `stripQuotes`/`generateNodeIdFromEntityId`, then
  remove `util/entityParser.ts`, the redundant `util/frontmatter` parsers,
  `EntityIndexEntry`/`EntityFrontmatter`/`entityNavigator` internals, and the
  `EntityIndexAdapter` shim. `ItemFrontmatter` becomes a thin projection type (or is deleted).

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Positioning layout regresses (mapper drops/renames a field the engine reads) | Positioning regression-lock (`positioning-config` + `positioningV4Synthetic` + vault-validation 0-unpositioned) must stay green; the mapper is the single translation point, unit-tested. |
| `main.ts` has no direct unit tests → silent behavior change | Phase 0 raises integration coverage on the touched flows first; each phase gated on green. |
| entity-core index/allocator latent bugs surface when plugin adopts them | Phase 2a pinned them at 99-100% coverage; known quirks documented in §2a (`allocate()` vs `reserve()`, lenient id parsing) — Phase 3 must not allocate before the index is populated. |
| Plugin-only fields lost on write | Round-trip corpus (`frontmatterRoundTrip.test.ts` — already covers all three fields) + passthrough modeling. |
| Parser default divergence changes created entities (`task` coercion, `default`/`effort` workstream fallback) | Reconcile defaults explicitly in Phase 2; assert the chosen defaults in tests. |
| Big-bang breakage | Strictly phased; each phase is independently shippable and reversible; duplicates deleted only in Phase 5. |

## 8. Testing strategy
- **Reuse the guards:** positioning regression-lock, `frontmatterRoundTrip` corpus, MCP stdio
  integration suite, entity-core parser/serializer suites (91-95%).
- **New:** mapper unit tests (parse→map→position parity; plugin-field preservation; camelCase
  bridge; `priority` default); Phase 2a entity-core index/allocator tests (→≥90%);
  `ProjectIndex`-backed navigator tests; expanded `main.ts` integration tests per phase.
- **Invariant:** `positioning-vault-validation` stays at **0 unpositioned** throughout.

## 9. Acceptance criteria
- [ ] One in-memory model: `RuntimeEntity`; `EntityData`/`ItemFrontmatter` are pure projections.
- [ ] All plugin reads go through `EntityParser`; all navigation through `ProjectIndex`.
- [ ] `util/entityParser.ts` (with `stripQuotes`/`generateNodeIdFromEntityId` relocated),
      redundant `util/frontmatter` parsers, `EntityIndexEntry`, `EntityFrontmatter`,
      `entityNavigator` internals, and `EntityIndexAdapter` are deleted.
- [ ] Plugin-only fields round-trip via passthrough.
- [x] `project-index.ts`, `id-allocator.ts`, `schema-registry.ts` ≥90% coverage (100/100/99.5, Phase 2a).
- [ ] Full suite green; positioning 0-unpositioned; `build:plugin` + `build:mcp` pass.
- [ ] `main.ts` no longer imports `util/entityParser` or `util/entityNavigator`'s index.

## 10. Open questions (resolved)
- ~~Custom fields vs passthrough for plugin-only fields?~~ **Resolved:** passthrough — it is
  what entity-core documents and the round-trip corpus already tests. Promotion to schema
  custom fields is possible later without another migration.
- ~~Keep `ItemFrontmatter` as a named projection type?~~ **Resolved:** yes — thin projection
  produced by `toItemFrontmatter()`, minimizing `ui/*` churn.
- ~~Reconcile parser defaults toward entity-core?~~ **Resolved:** yes — `engineering`
  workstream, literal unknown type. Phase 2 asserts no plugin flow depends on the old
  `default`/`task`/`effort` coercions.

---

_See `docs/UNIFICATION_REFACTOR_PLAN.md` §1/§5/§8 for the source analysis and
`docs/POSITIONING_ARCHITECTURE.md` for the positioning contract this must preserve.
Claim-by-claim code verification performed 2026-07-07; all file:line references in this
document reflect that audit._
