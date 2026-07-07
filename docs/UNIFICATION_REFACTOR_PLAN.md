# Plugin ⇄ MCP Unification Refactor Plan

_Goal: eliminate the duplication between the Obsidian **plugin** runtime (`main.ts` +
`util/*` + `ui/*` + `notion/*`) and the shared **entity-core** library that MCP
(`mcp.ts`) runs on, so there is one implementation of each concern._

## The crux (why this is mostly low-code but high-decision)

The delegation seam **already exists**: `main.ts:9406` builds an `EntityCoreFacade`
and wires an index adapter, and the facade already exposes `parse`, `serialize`,
`validate`, `pathResolver`, and `relationshipGraph`. **But the plugin calls only
`allocateId`.** For every other concern the plugin still runs its `util/*` twin.

So unification is largely "call the facade method that already exists instead of the
`util/*` one." The risk is **not** missing engine code — it is that the two
implementations produce **different output** (file format, folder layout, which
inverse fields get written). Flipping the plugin to the facade therefore **changes
files on disk** and needs a decision + (often) a one-time data migration.

## Already unified (done)

- **Schema** is single-source: `default-schema.ts` → `schema-derivation.ts`
  (`buildValidationAllowList`, `buildRelationshipRules`, `buildReverseRelationMap`).
- **Positioning/containment** derives from the schema's `positioning` metadata and is
  configurable + designer-editable (see `POSITIONING_ARCHITECTURE.md`). **Preserve.**
- **Filename sanitization**: `util/fileNaming` uses entity-core `sanitizeTitleForFilename`
  (snake_case) — plugin + MCP now emit identical `<id>_<slug>.md`. _(On-disk file rename
  migration still pending — see §9.)_
- **Workstream aliasing**: `util/workstream` uses `DEFAULT_SCHEMA.workstreams.normalization`.
- **ID allocation** (partial): `main.ts` `generateEntityId()` → `entityCore.allocateId()`
  with a legacy fallback.

## The concerns

| # | Concern | Recommendation | Risk | Decision needed |
|---|---|---|---|---|
| 1 | Frontmatter **parse** (3 plugin parsers vs `EntityParser`) | Reconcile→delegate via a `RuntimeEntity→EntityData` mapper | med-high | — |
| 2 | Frontmatter **serialize** (plugin inline-JSON/unquoted vs `EntitySerializer` quoted/block) | Reconcile→delegate | **high** | **Canonical serializer** |
| 3 | Relationship **reconciliation** (additive + hardcoded inverse + destructive cycle-break vs schema-driven `syncBidirectional` + cycle-reject) | Reconcile→delegate | **high** | **Cycle policy** |
| 4 | **ID allocation** | Thin-delegate (finish) | low | — |
| 5 | **Index / navigation** (`EntityIndexEntry` vs `ProjectIndex`) | Architectural | **high** | (framing) |
| 6 | **Validation** (plugin has none; MCP `validate_project` re-implements vs `EntityValidator`) | Plugin: add `validateEntity`; MCP: fold into validator | low-med | Coerce on write? |
| 7 | **Status/priority normalization** (plugin coerces but misses feature statuses; entity-core rejects) | Reconcile→delegate (shared schema-driven normalizer) | med | Coerce on MCP write? |
| 8 | **Entity data model** (4+ shapes: `EntityData`/`ItemFrontmatter`/`EntityIndexEntry` vs `RuntimeEntity`/`EntityMetadata`) | Architectural (canonical = `RuntimeEntity`) | **high** | (framing) |
| 9 | **Path/folder routing** (plugin `milestones/` vs entity-core `entities/milestones/`) | Reconcile→delegate | med | **Vault layout** |
| 10 | Canvas/DOM/Notion/UI | Leave (plugin-specific) | — | — |

## Decisions required (blockers for the high-risk concerns)

1. **Canonical serializer (§2).** Adopt `EntitySerializer` (double-quoted scalars, YAML
   block arrays) everywhere? This **reformats every entity file** on next write, but it
   **eliminates the entire YAML-sanitization bug class** (`util/yamlSanitizer.ts`,
   `sanitizeRelationships.ts` exist only because the plugin's unquoted writer breaks on
   colons). The plugin-only fields (`inProgress`, `created_by_plugin`, `notion_page_id`)
   must become schema custom fields or `passthrough` to survive. _Recommendation: yes,
   adopt `EntitySerializer`; model the plugin fields as passthrough; do it as one
   deliberate reformat with a vault backup._ **Caveat:** the plugin's
   `applyFrontmatterUpdates` edits in place via Obsidian and preserves body/comments —
   a capability `EntitySerializer` lacks; confirm comment preservation isn't required.

2. **Cycle policy (§3).** The plugin **auto-heals** relationship cycles by deleting the
   back-edge (data loss but self-repairing); entity-core **prevents** cycle-closing
   writes and never deletes. These are opposite philosophies. _Recommendation: adopt
   `RelationshipGraph.syncBidirectional` for inverse sync (fixes the hardcoded/deprecated
   `enables` inverse and additive-only bug), but **keep a plugin-side cycle breaker**
   until all writes funnel through `link()`, since free-form Obsidian edits bypass it._

3. **Vault layout (§9).** Does the production vault use bare `milestones/` (plugin) or
   `entities/milestones/` (entity-core)? _This is a data fact to confirm against the
   AgentPlatform vault, not a preference._ If bare, set the facade's `entitiesFolder`
   to `''`; if prefixed, migrate the plugin. Filename half is already unified.

4. **Coerce-on-write (§6/§7).** Should MCP **coerce** free-form status input to the
   canonical vocab (as the plugin does) or keep **reject-only**? _Recommendation: a
   shared schema-driven `normalizeStatus(type, input)` in entity-core (covering feature
   statuses, which the plugin currently mis-maps); plugin delegates; MCP coercion opt-in._

## Sequenced execution plan

**Phase A — safe, no decision (executed autonomously):**
- Delete dead `util/positioningV3.ts` + the uncalled `repositionCanvasNodesV3()` method
  (only V4 is wired to commands) and dead `notion/contentSync.ts`. ~2,100 LOC removed.
- Positioning **regression-lock** tests in place (see `POSITIONING_ARCHITECTURE.md`) so
  no later refactor can silently change layout.
- Comprehensive test coverage of the testable surface (see `TEST_COVERAGE`).

**Phase B — decision, medium risk (after sign-off):**
- §7 Status normalization: add schema-driven normalizer to entity-core (fix feature
  statuses), plugin delegates.
- §9 Path routing: confirm vault layout, unify on `PathResolver`.
- §6 Validation: surface `facade.validateEntity()` (warning-mode first); fold
  `validate_project` into `EntityValidator`.
- §4 ID allocation: drop the legacy fallback or port `sessionHighWater` into the adapter.

**Phase C — decision + migration, high risk (do together, with a vault backup):**
- §2 Serialize → `EntitySerializer` (one-time reformat).
- §3 Reconciliation → `syncBidirectional` (+ cycle-breaker decision).
- §8 + §5 model/index → canonical `RuntimeEntity` + `ProjectIndex`; retire `EntityData`
  (positioning becomes a mapper projection), `ItemFrontmatter`, `EntityIndexEntry`.
- Filename on-disk rename migration (from §9-decided layout, snake_case slugs).

Each Phase-C step is guarded by the regression-lock + the round-trip corpus in
`tests/testdata/vault`, and should ship behind a one-time migration command with a
dry-run + backup, never as a silent write.

## Why Phase C is not run unattended

Every Phase-C change **rewrites the user's vault files** (format, inverse fields, or
location). Those are irreversible-without-backup data operations that also encode
product decisions (§ decisions above). They are designed here and guarded by tests, but
must be executed with the owner present and a backup — the same reason the filename
rename migration was flagged rather than run.
