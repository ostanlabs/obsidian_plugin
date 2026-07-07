# Positioning & Containment Architecture

How the canvas layout is decided, and how it's configured from the schema. Positioning
is **fully schema-driven**: there is one source of truth (`schema.json`, defaulting to
`DEFAULT_SCHEMA`), and both the MCP validator and the plugin's layout engine derive
their behavior from it.

## The pipeline

```
schema.json  (or DEFAULT_SCHEMA)          ← single source of truth
      │
      │  each relationship carries `positioning` metadata
      ▼
buildRelationshipRules(schema)            src/entity-core/schema-derivation.ts
      │  → DerivedRelationshipRule[]  (sourceType, field, targetType, action, direction, …)
      ▼
PositioningEngineV4(config)               util/positioningV4.ts
      │  consumes the rules; lays out nodes on the canvas
      ▼
Canvas node coordinates
```

- **MCP** (`mcp.ts`): loads/persists `schema.json` (`get_schema` / `set_schema`), and
  the schema designer (`get_schema_designer`) edits it — including positioning metadata.
- **Plugin** (`main.ts`): loads `schema.json` (read-only), calls
  `buildRelationshipRules(schema)`, and passes the rules **plus**
  `schema.settings.overlapPriorityOrder` into `PositioningEngineV4`.

So a change to a relationship's `positioning` in `schema.json` changes the canvas layout
with no code change.

## Two roles: containment vs sequencing

Every relationship's `positioning.role` is one of:

- **`containment`** — decides *where a node sits* (its parent in the tree). Drawn solid.
- **`sequencing`** — decides *sibling order* among already-placed nodes. Drawn dashed.

### Containment

```jsonc
"positioning": { "role": "containment", "containerEnd": "to", "priority": 1, "emitParentRule": true }
```

- **`containerEnd`** — which end of the pair is the *container*. `"to"` (default) means the
  `from` entity sits **inside** the `to` entity; `"from"` means the reverse.
  - e.g. `hierarchy` pair `{from: task, to: story}` with `containerEnd: "to"` ⇒ task sits under story.
  - e.g. `implementation` pair `{from: milestone, to: feature}` with `containerEnd: "from"` ⇒ feature sits under milestone.
- **`priority`** — when an entity has several candidate containment parents, the lowest-`priority`
  rule wins as the real parent; the rest become edge-only links. (Used to resolve conflicts.)
- **`emitParentRule`** — also emit the mirror rule so the *container* can claim children via
  its reverse field (e.g. `feature.documented_by → document`), not only the child via its
  forward field.

`buildRelationshipRules` turns each containment pair into a **child rule**
(`childType.childField → containerType`, `direction: child`) and, if `emitParentRule`, a
**parent rule** (`containerType.parentField → childType`, `direction: parent`).

### Sequencing

```jsonc
"positioning": { "role": "sequencing", "forwardDirection": "after", "emitReverseRule": true,
                 "crossWsPositioning": true, "crossWsExcludedTypes": ["task"] }
```

- **`forwardDirection`** — `"after"` means the `from` node is placed after its `to` target
  (the forward field, e.g. `depends_on`, points backward in time); `"before"` is the inverse.
- **`emitReverseRule`** — also emit the reverse-field rule (e.g. `blocks`) with the opposite
  direction.
- **`crossWsPositioning`** — allow this ordering to apply across workstream lanes.
- **`crossWsExcludedTypes`** — entity types exempt from cross-workstream ordering
  (default `["task"]` on `dependency`, so task ordering stays within a lane).

## Schema settings

```jsonc
"settings": {
  "overlapPriorityOrder": ["milestone", "story", "task", "decision", "document", "feature"]
}
```

- **`overlapPriorityOrder`** — when two nodes would overlap, higher-priority (earlier in the
  list) types stay fixed and lower-priority types move. Threaded into the engine from the
  schema; types not listed sort last.

## Engine phases (high level)

`PositioningEngineV4.calculatePositions()` runs a sequence of phases. The ones that matter
for containment/alignment:

- **Phase 2** — extract relationships via the ruleset; separate containment vs sequencing;
  resolve each entity's single `containmentParentId` by `priority`.
- **Phase 3** — categorize entities: `contained`, `floating-single-ws`, `floating-multi-ws`,
  `orphan`.
- **Phase 3.5** — infer containment from dependents for entities without an explicit parent
  (extended to cover `document`/`feature`, not just `story`/`task`/`decision`).
- **Phases 4–12** — cycle detection, container sizing, workstream lanes, child layout,
  floating/deferred/orphan placement.
- **Phase 12.5 — `completeContainmentPositioning()`** (schema-agnostic): a fixpoint pass that
  places any node still unpositioned but with a resolved `containmentParentId` beside its
  (now positioned) container, iterating until deep chains resolve. This is what guarantees
  deep chains such as `decision → document → feature → (story|milestone)` are fully placed
  even when a document documents multiple features or a decision affects multiple documents
  (which otherwise get marked "deferred" and dropped).

## Configuring positioning

1. **Edit the schema.** In the designer (`get_schema_designer`), each relationship has a
   positioning editor (role + role-conditional fields). Or edit `schema.json` directly.
2. **Apply.** Paste into `set_schema { "schema": <…> }` (MCP validates the positioning
   metadata: `role` ∈ {containment, sequencing}, `containerEnd` ∈ {from, to},
   `forwardDirection` ∈ {before, after}, `priority` ≥ 0). MCP persists it and hot-reloads.
3. **Plugin picks it up** on next load — no rebuild required.

### Adding a new relationship with custom positioning

Add a relationship to `schema.relationships` with `pairs` and a `positioning` block:

```jsonc
{
  "name": "review", "label": "Review",
  "pairs": [{ "from": "task", "to": "decision", "forward": "reviewed_by", "reverse": "reviews" }],
  "cardinality": { "forward": "one", "reverse": "many" },
  "positioning": { "role": "containment", "containerEnd": "to", "priority": 2 }
}
```

`buildRelationshipRules` will emit the child rule automatically; the engine will place tasks
under their reviewing decision. No engine code changes needed.

## Alignment invariant

**Positioning consumes the schema's valid relationships.** A relationship that is a valid
containment pair (present in `buildValidationAllowList`) and carries
`positioning.role: containment` will be used by the engine to place nodes. The live-vault
diagnostic (`tests/positioning-vault-validation.test.ts`) asserts the engine positions the
overwhelming majority of a real vault, guarding against regressions in this alignment.

## Known limitation

`emitParentRule` on `documentation`/`decision-impact` emits correct parent rules
(`feature.documented_by → document`, `document.decided_by → decision`) at the **ruleset**
layer, but the plugin's `entityParser` does not yet populate `documented_by`/`decided_by` on
`EntityData`, so those parent rules are currently inert in the plugin's data pipeline. Deep
nesting still resolves via Phase 12.5 (which works off the child-side `containmentParentId`),
so there is no functional gap today — but populating the reverse fields in the parser would
make the parent rules active and is the natural follow-up.
