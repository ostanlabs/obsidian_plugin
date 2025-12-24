# Changelog

All notable changes to the Canvas Project Manager plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-12-24

### 🎉 Major Release - Canvas Project Manager

Complete rewrite with multi-entity type support and enhanced project management features.

#### ✨ New Features

##### Multi-Entity Type Support
- **6 Entity Types**: Milestone, Story, Task, Decision, Document, Accomplishment
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

##### 17 Commands
- Populate canvas from vault
- Reposition nodes (graph layout)
- Remove duplicate nodes
- Entity navigation commands (parent, children, dependencies, documents, decisions)
- Notion sync commands
- And more...

#### 🔄 Changes from v1.0

- Renamed from "Canvas Accomplishments" to "Canvas Project Manager"
- Expanded from 2 entity types (Task, Accomplishment) to 6 entity types
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
- **Bidirectional Sync**: Sync notes to Notion on creation or on-demand
- **Property Mapping**: Full mapping of note properties to Notion

### 📦 Dependencies

- `obsidian`: ^1.4.0 (peer dependency)
- `@notionhq/client`: ^2.2.13
- `typescript`: ^5.0.0
- `esbuild`: ^0.17.0

---

**Note**: Future updates will follow semantic versioning and maintain backward compatibility where possible.

