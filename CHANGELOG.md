# Changelog

All notable changes to the Canvas Project Manager plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

