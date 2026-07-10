# Changelog

All notable changes to the Canvas Project Manager plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-10

### 🚀 Multi-Vault MCP (major — tool contracts changed)

One MCP server process now manages **any number of vaults**. Existing single-vault setups keep working unchanged (`VAULT_PATH` is absorbed into the registry automatically), but the tool surface changed shape — hence the major bump.

- **Vault registry**: global config at `~/.config/ostanlabs/mcp.json` (`%APPDATA%` on Windows) with hand-edited `allowedRoots` confinement (deny-by-default; no tool can widen it); per-call config re-reads; lock-safe mutation; MCP client `roots` and `VAULT_PATH` absorbed as transient vaults
- **New tools**: `list_vaults`, `add_vault` (scaffold a fresh vault or adopt an existing one with on-disk layout detection — never creates a competing tree), `remove_vault` (deregister only, never deletes files), `list_workspaces`/`add_workspace`/`remove_workspace`, `reconcile_vault`
- **`vault` argument** on every tool: hard-required for mutating tools; read-only tools default to the sole vault only when exactly one is registered; every result echoes the resolved vault id
- **Accept-then-match validation**: with one vault, tool schemas carry that vault's enums (unchanged); with several, the API layer accepts any registered schema's values and dispatch rejects mismatches with a `SchemaMismatch` naming the vault and its valid values (per-item in `entities` batches)
- **Transactional schema reconciliation**: `set_schema` (+ `dryRun`, `collisionPolicy: refuse|suffix`) and `reconcile_vault` archive removed-type entities copy-then-delete with verification, a crash-safe roll-forward journal, tombstones, and an on-disk applied-schema baseline so hand-edits made while the server is down are still caught
- **Bootstrap**: scaffolded vaults get schema.json, typed folders, `workspaces.json`, a root-level canvas named after the vault, and the bundled plugin **plus its Dataview dependency** installed and pre-enabled (`installPlugin: false` to skip; Dataview needs network and degrades to a warning offline)
- **Security**: every agent-supplied path is realpath-confined to `allowedRoots` at registration AND access time (symlink/TOCTOU defenses); workspace doc reads restricted to `.md`/`.canvas`
- **Fixes along the way**: `cleanup_completed` now actually deletes originals after verified archive copies; `entities` batch `{{client_id}}` refs resolve inside `relationships` (previously written literally); duplicate-id repair rewrites inbound references; per-vault MSRL indexes

### ⚠️ Breaking

- With more than one vault registered, mutating tools **require** the `vault` argument and tool schemas no longer embed entity-type/status enums (call `get_schema({vault})`)
- `create_entity`/`entities` type/status violations now surface as `SchemaMismatch` errors naming the target vault (previously generic "Validation failed" on the create path)

## [1.9.2] - 2026-07-09

### 🩹 Release Fix

- **Configurable Obsidian config dir in plugin auto-install**: the vault-bootstrap plugin installer hardcoded `.obsidian/`; it now honors `OBSIDIAN_CONFIG_DIR` (default `.obsidian`) for vaults with a renamed config folder. Fixes the `obsidianmd/hardcoded-config-path` lint error that blocked the 1.9.0/1.9.1 release workflows (those tags were removed; this release carries their changes)

## [1.9.1] - 2026-07-09

### 🔧 Schema-Derived Tool Surface

- **Entity-type enums in MCP tool inputSchemas are schema-derived**: `create_entity`, `list_entities`, `search_entities`, `manage_documents`, and `entities` advertised a hardcoded `milestone|story|task|decision|document|feature` enum — custom types added via `set_schema` were rejected by schema-enforcing clients. All six spots now derive from the active schema per `tools/list` request
- **`tools/list_changed` notification**: the server declares the `listChanged` capability and notifies clients after a successful `set_schema`, so they re-fetch the updated tool schemas
- **create/update tool descriptions** point at `get_schema` as the authoritative source for valid relationship fields and target types

## [1.9.0] - 2026-07-09

### 🧬 Schema as Single Source of Truth

- **Validation rules live in the schema**: relationships gained a `validation` block — `requiredForTypes` (drives the ORPHANED_ENTITY rule) and `maxForwardTargets`/`maxReverseTargets` (drive the fan-out advisories). `validate_project` derives its entire rule set from the ACTIVE schema, so `set_schema` edits take effect immediately (legacy rule ids preserved; custom rules get generated `<REL>_<END>_FANOUT` ids)
- **Descriptions in the schema**: entity types, relationships, and ambiguous fields carry `description` strings surfaced by `get_schema` (including the decision `decided_by` person-field vs relationship-field disambiguation)
- **Hardcoded relationship lists eliminated**: validate_project's field list, reconciler ordering rules, entity-navigator entry fields, sanitization fields, and frontmatter always-emit fields now all derive from the schema (new helpers in `schema-derivation.ts`); deprecated `enables`/`enabled_by` kept as explicit legacy fields. Fixes a drift bug: `next_version` was missing from sanitization
- **`emitWhenEmpty` relationship flag** replaces the hardcoded frontmatter always-include list; **`settings.defaultCanvas`** codified in the default schema

### 🚀 Empty-Vault Bootstrap (zero manual setup)

- **Canvas bootstrap**: on startup (and after `set_schema`) the MCP ensures `settings.defaultCanvas` (default `projects/Project.canvas`) exists with valid canvas JSON; zero-byte canvases are repaired
- **Plugin auto-install**: the npm package ships the plugin artifacts next to the MCP server, so startup installs/upgrades the plugin into `<vault>/.obsidian/plugins/canvas-project-manager/` and enables it in `community-plugins.json` — no separate download-and-extract step. Never downgrades; never touches `data.json`
- **Crash-proof canvas reads**: `loadCanvasData`/`readCanvas` treat empty files as empty canvases, normalize missing `nodes`/`edges` keys, and throw descriptive errors on corrupt JSON instead of `SyntaxError: Unexpected end of JSON input`

### 🔧 set_schema Hot-Reload Fixes

- **Stale `pathResolver`**: rebuilt in `applySchema` — creating an entity of a schema-added custom type no longer throws "Unknown entity type"
- **`scanIndex` schema-driven**: entity folders derive from the active schema (custom-type folders are scanned; no more hardcoded pluralization)

## [1.8.46] - 2026-06-29

### 🔒 Security & Submission Compliance

- **Removed HTTP server**: Eliminated embedded localhost HTTP server with unauthenticated wildcard-CORS access (A7/B1 blockers)
- **Manifest: removed "Obsidian" from description** to satisfy community-plugin validation bot (A1)
- **Manifest: `isDesktopOnly` set to `true`** — plugin uses Node.js APIs not available on mobile (A2)
- **versions.json**: Updated to include all released versions mapped to minAppVersion (A4)
- **Fixed XSS via `innerHTML`**: Replaced with safe DOM API construction (A5/B8)
- **Fixed template replacement injection**: User values no longer passed as raw `String.replace` replacement strings (B11)
- **Fixed canvas double-node add**: Single-node creation no longer pushes to both internal data and visual layer (B4)
- **Fixed Notion content replacement**: Now uses chunked append with 100-block batching; no delete-before-append data loss (B3)
- **Fixed leaked DOM listeners**: Search-popup close-on-outside-click listener now properly cleaned up (B9)
- **Fixed Notion rate-limit handling**: Added exponential backoff and 429 retry (B10)
- **`isPluginCreatedNote` now includes `feature` entity type** (fileNaming.ts)
- **Fixed `entityNavigator` reading migrated-away `enables` field**
- **Logger: gated file writes behind debug flag** to avoid excessive I/O (A8/B12)
- **Logger: append-only writes** instead of O(n) read-rewrite per call (B12)
- **ESLint config: added `@typescript-eslint` rules** — previously only `obsidianmd/*` rules ran
- **README: added Network Use / Privacy section** disclosing Notion API data transmission (A6)

## [1.8.42] - 2026-02-28

### 📚 Documentation Release

- **Comprehensive Documentation**: Complete documentation overhaul with 11 new guides
- **README Updates**: Updated README with all 29 commands, version badges, and comprehensive feature documentation
- **Feature Coverage**: Added Feature Coverage View documentation
- **Entity Navigator**: Documented in-memory navigation system
- **Relationship Reconciliation**: Complete guide for bidirectional relationship sync
- **Visual Styling**: Comprehensive CSS patterns documentation
- **Archive System**: Detailed archive structure and workflow documentation
- **Workstream Normalization**: Auto-normalization rules and AI feedback
- **Frontmatter Examples**: Complete examples for all entity types
- **Version Badges**: Added version badges and release information

### 🔧 Improvements

- **Package Version Sync**: Synchronized package.json with manifest.json (v1.8.42)
- **Documentation Links**: Added prominent links to obsidian_docs comprehensive documentation
- **Installation Guide**: Updated with latest version information

## [1.8.4] - 2026-01-14

### ✨ Feature Entity Support

- **Populate Canvas**: Features are now included when populating canvas from vault (red color, 300x220 size)
- **Reposition Canvas**: Features are now properly positioned based on their `implemented_by` relationship:
  - Single implementer: Feature positioned to the LEFT of the milestone/story that implements it
  - Multiple implementers: Feature positioned to the LEFT of the leftmost implementer, vertically centered
  - Features without implementers: Positioned at a default location left of all milestones

## [1.8.3] - 2026-01-14

### 🎨 Canvas Layout Improvements

- **Multi-Milestone Document Positioning**: Documents implemented by multiple milestones now consider the full bounding box of each milestone (including stories/tasks) when calculating vertical position to avoid overlapping with child entities

## [1.8.1] - 2026-01-13

### 🎨 Canvas Layout Improvements

- **Adaptive Multi-Column Layout**: Stories and tasks within milestones now use adaptive column layout:
  - 1-4 items → 1 column (unchanged)
  - 5-8 items → 2 columns
  - 9+ items → 3 columns
- Reduces vertical sprawl for milestones with many dependencies
- Milestone positioning relative to each other remains unchanged

## [1.8.0] - 2026-01-13

### ✨ Feature Entity Support

Added new Feature entity type (F-XXX) for product feature tracking with full lifecycle management.

#### Phase 1: Core Entity Support
- **Feature Entity Type**: New entity type for tracking product features (F-XXX IDs)
- **Feature Classification**: Tier (OSS/Premium), Phase (MVP/0-5), Status (Planned/In Progress/Complete/Deferred)
- **Feature Relationships**: `implemented_by`, `documented_by`, `decided_by`, `depends_on`, `blocks`
- **Create Feature Command**: New command to create feature entities with modal UI
- **Set Feature Phase/Tier Commands**: Commands to update feature classification

#### Phase 2: Relationship Management
- **Bidirectional Sync**: Automatic sync for implements↔implemented_by, documents↔documented_by, affects↔decided_by, depends_on↔blocks
- **Reconcile Command**: `reconcile-all-relationships` command to sync all relationships across vault
- **Entity Navigator Integration**: Navigate to features from implementing entities

#### Phase 3: Canvas Support
- **Features Canvas**: `create-features-canvas` command creates tier/phase grid layout
- **Auto-Layout**: `auto-layout-features` command positions features by tier and phase
- **Populate Canvas**: `populate-features-canvas` command adds vault features to canvas
- **Dependency Edges**: Visual dependency arrows between features on canvas

#### Phase 4: UI Components
- **Feature Modal**: FeatureModal.ts for creating/editing features
- **Link Feature Modal**: LinkFeatureModal.ts for linking entities to features
- **Feature Details View**: FeatureDetailsView.ts sidebar panel showing feature relationships
- **Context Menu**: Feature navigation options in entity context menus

#### Phase 5: Queries and Views
- **Feature Coverage View**: FeatureCoverageView.ts with filters, summary stats, and gap highlighting
- **Dataview Integration**: Standard YAML frontmatter compatible with Dataview queries
- **Search Indexing**: EntityIndex includes full feature support

#### Phase 6: Migration Tools
- **Import Features**: `import-future-features` command parses FUTURE_FEATURES.md
- **Link Suggestions**: `suggest-feature-links` command finds matching milestones/stories
- **Bulk Linking**: `bulk-link-features` command for batch relationship management

#### Schema Changes
- Added `implements`, `documents`, `affects` fields to ItemFrontmatter for bidirectional relationships
- Added FeatureFrontmatter interface with all feature-specific fields
- Added feature ID prefix (F-) to ID generator

---

## [1.7.0] - 2025-12-24

### 🎉 Major Release - Canvas Project Manager

Complete rewrite with multi-entity type support and enhanced project management features.

#### ✨ New Features

##### Multi-Entity Type Support
- **6 Entity Types**: Milestone, Story, Task, Decision, Document, Feature
- **Visual Differentiation**: Distinct border styles and widths per entity type
- **Hierarchical Relationships**: Parent-child relationships via `parent` frontmatter field
- **Dependency Tracking**: `depends_on` and `enables` fields for relationship management
- **Workstream Organization**: Group entities by workstream for lane-based layout

##### Canvas Population & Layout
- **Populate from Vault**: Scan vault for entity files and add to canvas automatically
- **Hierarchical Layout**: Milestones centered, stories below, tasks fanning out
- **Workstream Lanes**: Entities positioned by workstream
- **Duplicate Prevention**: Prevents adding duplicate entity nodes

##### Archive System
- **Automatic Archiving**: Entities with `status: archived` moved to archive folders
- **Type-specific Folders**: `archive/milestones/`, `archive/stories/`, `archive/tasks/`, etc.
- **Canvas Cleanup**: Archived nodes automatically removed from canvas
- **Archive Exclusion**: Archived files excluded from vault scans

##### Entity Navigator
- **Relationship Navigation**: Jump to parent, children, dependencies, documents, decisions
- **Keyboard Shortcuts**: Ctrl+Shift+P (parent), Ctrl+Shift+D (documents), Ctrl+Shift+E (decisions)
- **Index-based Lookups**: Fast in-memory entity index for quick navigation
- **Context Menu Integration**: Right-click entities to see navigation options

##### Visibility Toggles
- **Entity Type Filters**: Show/hide Milestones, Stories, Tasks, Decisions, Documents
- **Toggle Buttons**: M/S/T/De/Do buttons on canvas view
- **Persistent State**: Visibility preferences maintained during session

##### 19 Commands
- Populate canvas from vault
- Reposition nodes (graph layout)
- Remove duplicate nodes
- Focus on In Progress
- Entity navigation commands (parent, children, dependencies, documents, decisions)
- Notion sync commands
- HTTP Server for external tool integration
- And more...

#### 🔄 Changes from v1.0

- Renamed from "Canvas Accomplishments" to "Canvas Project Manager"
- Expanded from 2 entity types (Task, Accomplishment) to 5 entity types
- Added archive system for completed work
- Added Entity Navigator for relationship navigation
- Added visibility toggles for entity types
- Added workstream-based layout algorithm
- Updated visual styling with CSS-based differentiation

---

## [1.0.0] - 2025-12-06

### 🎉 Initial Release

#### ✨ Features

##### Core Functionality
- **Structured Note Creation**: Create Task and Accomplishment notes with rich metadata
- **Auto-generated IDs**: Sequential ID generation (T001, T002, A001, etc.)
- **Template System**: Support for default templates with placeholder replacement
- **Canvas Integration**: Direct creation and management of notes within Obsidian Canvas

##### Canvas Features
- **Create Canvas Items**: Add structured notes to canvas via Command Palette
- **Convert Text Nodes**: Right-click menu to convert text nodes to file nodes
- **Color Coding**: Automatic color assignment based on effort level

##### Notion Integration
- **Database Auto-creation**: Automatically create Notion databases
- **One-way Sync**: Push notes to Notion on creation or on-demand
- **Property Mapping**: Full mapping of note properties to Notion

### 📦 Dependencies

- `obsidian`: ^1.4.0 (peer dependency)
- `@notionhq/client`: ^2.2.13
- `typescript`: ^5.0.0
- `esbuild`: ^0.17.0

---

**Note**: Future updates will follow semantic versioning and maintain backward compatibility where possible.

