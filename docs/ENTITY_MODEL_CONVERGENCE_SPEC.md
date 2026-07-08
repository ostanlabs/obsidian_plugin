# Spec — Entity Model + Parse + Index Convergence (§1 / §8 / §5)

**Status:** Proposed (not started). **Owner:** TBD. **Risk:** High (architectural, touches the
untested `main.ts`). **Prereqs met:** schema single-source, positioning regression-lock,
unified filenames/serializer/reconciler, obsidian-mock harness — all done.

This is the last large piece of the plugin ⇄ MCP unification. It is the *framing* refactor
the remaining duplication rides on: collapse the plugin's parallel entity model, parsers, and
index onto the shared `entity-core` types (`RuntimeEntity` + `EntityMetadata` + `ProjectIndex`),
so there is **one** in-memory representation of an entity and **one** index across the plugin
and MCP.

---

## 1. Motivation

The `EntityCoreFacade` seam exists (`main.ts:9406`) and already exposes `parse`, `serialize`,
`validate`, `pathResolver`, `relationshipGraph`, `allocateId` — but the plugin calls **only
`allocateId`**. Everything else still runs the plugin's `util/*` twin. The remaining
duplication is not "missing engine code" — it is **four-plus parallel shapes for 'an entity'**
plus three parsers plus a second index. Unifying them removes the last class of drift bugs
(camelCase↔snake_case, dropped passthrough keys, hardcoded relationship-field lists) and lets
the plugin inherit the well-tested `entity-core` (97%) instead of maintaining its own.

## 2. Current state (what diverges)

### §8 — Four+ entity shapes
| Model | File | Shape | Relationship keys |
|---|---|---|---|
| `EntityData` | `util/positioningV4.ts` (built by `util/entityParser`) | positioning input | **camelCase** (`dependsOn`, `implementedBy`) |
| `ItemFrontmatter` / `FeatureFrontmatter` | `types.ts` | flat frontmatter + plugin-only fields (`inProgress`, `created_by_plugin`, `notion_page_id`) | snake_case, typed optional arrays |
| `EntityIndexEntry` | `util/entityNavigator.ts` | index entry holding a `TFile` | hardcoded snake_case field set |
| `RuntimeEntity` (`Entity<T>`) | `src/entity-core/types.ts` | `system` + `fields` + `relationships` + `passthrough` | schema-driven `relationships` map |
| `EntityMetadata` | `src/entity-core/types.ts` | flat index metadata (`parent_id`, `children_count`) | — |

Divergences: camelCase vs snake_case relationship keys; plugin-only system fields absent from
`BaseEntity`; `priority` is a first-class field in `ItemFrontmatter` but a schema *custom field*
in entity-core.

### §1 — Three parsers (plugin) vs one (entity-core)
- Plugin: `util/entityParser.ts` (regex, → `EntityData` camelCase, coerces unknown type→`task`,
  workstream default `default`); `util/frontmatter.ts` `parseFrontmatter`/`parseAnyFrontmatter`
  (own value coercion, hardcoded array-field list, legacy-field migration); `parseFrontmatterAndBody`
  (raw strings). Plus direct `metadataCache.getFileCache().frontmatter`.
- entity-core: `EntityParser.parse` — real `YAML.parse`, schema-driven field/relationship/
  passthrough separation → `RuntimeEntity`. Only it preserves unknown keys.

### §5 — Two indexes
- Plugin: `util/entityNavigator.ts` `EntityIndex` — `Map<string, EntityIndexEntry>` off
  `metadataCache`, hardcoded `ID_PATTERNS` + relationship fields, linear-scan navigation.
- entity-core: `ProjectIndex implements EntityIndex` — primary map + secondary indexes
  (by_type/status/workstream/parent/canvas, archived, in_progress, priority) + forward/reverse
  relationship graph with schema-derived inverse map, O(1) typed queries. MCP runs entirely on it.
- A transitional shim already exists: `src/adapters/entity-index-adapter.ts`.

## 3. Goals / non-goals

**Goals**
- One canonical in-memory model: **`RuntimeEntity`** (+ `EntityMetadata` for the index).
- `EntityData` (positioning) and `ItemFrontmatter` (UI/frontmatter) become **projections** of
  `RuntimeEntity`, produced by pure mappers — not independently parsed shapes.
- All plugin **reads** go through `EntityParser`; all **navigation** through `ProjectIndex`.
- Delete `util/entityParser.ts`, the redundant `util/frontmatter` parsers, and
  `EntityIndexEntry`/`entityNavigator` internals.
- Plugin-only fields (`inProgress`, `created_by_plugin`, `notion_page_id`) survive round-trip
  as schema custom fields or `passthrough`.

**Non-goals**
- No change to the on-disk format (already unified: title-only filenames, quote-when-needed
  serializer, bare folders). No vault migration.
- No change to positioning *behavior* (guarded by the regression-lock).
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
  (`toEntityData(parse(x))` positions identically; `toItemFrontmatter` preserves plugin fields).
- **`ProjectIndex`** is the single index; `entityNavigator`'s public methods become thin queries
  over it (`getByParent`, `getRelated`, `buildAdjacency`).
- The **`EntityCoreFacade`** is the entry point the plugin calls for parse/serialize/index.

## 5. Design details

1. **Plugin-only fields** — model `inProgress`, `created_by_plugin`, `notion_page_id` as schema
   `custom fields` on the relevant entity types (preferred) or route them through
   `RuntimeEntity.passthrough`. Decide per-field; document in the schema. `priority` is already a
   schema custom field — drop its first-class status in the model, keep an accessor for the UI.
2. **camelCase ↔ snake_case** — the positioning engine reads camelCase (`dependsOn`) via
   `getFieldValue`'s bridge. `toEntityData()` owns that translation; the on-disk/`RuntimeEntity`
   side stays snake_case. One translation point, tested.
3. **Parser defaults** — reconcile the divergent defaults (unknown type: entity-core keeps the
   literal; workstream default: entity-core `engineering` vs plugin `default`). Pick entity-core's
   (schema-driven) and update any plugin code that relied on the old defaults.
4. **Index population** — the plugin's vault scan feeds `EntityMetadata` into a `ProjectIndex`
   instead of building `EntityIndexEntry`. `EntityIndexAdapter` stays as the bridge until the
   navigator is fully migrated, then is removed.

## 6. Phased plan (each phase ships green + committed)

> Guardrails for every phase: `jest` + `vitest` + MCP integration green; `positioning-vault-validation`
> **0 unpositioned**; `build:plugin` + `build:mcp` pass. Expand `main.ts` integration coverage
> (obsidian-mock harness) for each flow *before* touching it — `main.ts` is the untested risk.

- **Phase 0 — Coverage floor.** Raise integration coverage on the entity read/create/update/scan
  flows in `main.ts` that this refactor touches, so regressions are caught. (Extends the existing
  `plugin-*.test.ts` suites.)
- **Phase 1 — Mapper layer (pure, no behavior change).** Add `toEntityData(RuntimeEntity)`,
  `toItemFrontmatter(RuntimeEntity)`, and `fromItemFrontmatter(...)` in entity-core (or a plugin
  `util/model-map.ts` over entity-core types). Round-trip tests: parse→map→position identical to
  today; plugin fields preserved. Nothing consumes them yet.
- **Phase 2 — Route reads through `EntityParser`.** Replace `util/entityParser` *usage* in the
  positioning/create/scan paths with `facade.parse(...) → RuntimeEntity → toEntityData(...)`.
  Keep the old parser file until Phase 5. Verify positioning + round-trip unchanged.
- **Phase 3 — Adopt `ProjectIndex`.** Feed `EntityMetadata` from the vault scan into a
  `ProjectIndex`; rewrite `entityNavigator`'s public methods as `ProjectIndex` queries; keep the
  same method signatures so `ui/*` and canvas callers are unchanged. Retire `EntityIndexEntry`
  internally (via the adapter).
- **Phase 4 — Consumers.** Migrate `ui/*` views/modals and canvas code from `ItemFrontmatter`/
  `EntityIndexEntry` to the `RuntimeEntity` projections.
- **Phase 5 — Delete duplicates.** Remove `util/entityParser.ts`, the redundant `util/frontmatter`
  parsers, `EntityIndexEntry`/`entityNavigator` internals, and the `EntityIndexAdapter` shim.
  `ItemFrontmatter` becomes a thin projection type (or is deleted).

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Positioning layout regresses (mapper drops/renames a field the engine reads) | Positioning regression-lock (`positioning-config` + `positioningV4Synthetic` + vault-validation 0-unpositioned) must stay green; the mapper is the single translation point, unit-tested. |
| `main.ts` is 0–16% covered → silent behavior change | Phase 0 raises integration coverage on the touched flows first; each phase gated on green. |
| Plugin-only fields lost on write | Round-trip corpus (`frontmatterRoundTrip.test.ts`) + explicit schema-custom-field/passthrough modeling. |
| Parser default divergence changes created entities | Reconcile defaults explicitly in Phase 2; assert the chosen defaults in tests. |
| Big-bang breakage | Strictly phased; each phase is independently shippable and reversible; duplicates deleted only in Phase 5. |

## 8. Testing strategy
- **Reuse the guards:** positioning regression-lock, `frontmatterRoundTrip` corpus, MCP stdio
  integration suite, entity-core suites (97%).
- **New:** mapper unit tests (parse→map→position parity; plugin-field preservation; camelCase
  bridge); `ProjectIndex`-backed navigator tests; expanded `main.ts` integration tests per phase.
- **Invariant:** `positioning-vault-validation` stays at **0 unpositioned** throughout.

## 9. Acceptance criteria
- [ ] One in-memory model: `RuntimeEntity`; `EntityData`/`ItemFrontmatter` are pure projections.
- [ ] All plugin reads go through `EntityParser`; all navigation through `ProjectIndex`.
- [ ] `util/entityParser.ts`, redundant `util/frontmatter` parsers, `EntityIndexEntry`,
      `entityNavigator` internals, and `EntityIndexAdapter` are deleted.
- [ ] Plugin-only fields round-trip (schema custom fields or passthrough).
- [ ] Full suite green; positioning 0-unpositioned; `build:plugin` + `build:mcp` pass.
- [ ] `main.ts` no longer imports `util/entityParser` or `util/entityNavigator`'s index.

## 10. Open questions
- Model `inProgress`/`created_by_plugin`/`notion_page_id` as **schema custom fields** (typed,
  validated) or **passthrough** (opaque)? Recommendation: custom fields for the first two,
  passthrough for `notion_page_id`.
- Keep `ItemFrontmatter` as a named projection type for the UI, or have UI consume `RuntimeEntity`
  directly? Recommendation: a thin projection to minimize `ui/*` churn.
- Reconcile parser defaults toward entity-core (`engineering` workstream, literal unknown type) —
  confirm no plugin flow depends on the old `default`/`task` coercions.

---

_See `docs/UNIFICATION_REFACTOR_PLAN.md` §1/§5/§8 for the source analysis and file:line
references, and `docs/POSITIONING_ARCHITECTURE.md` for the positioning contract this must preserve._
