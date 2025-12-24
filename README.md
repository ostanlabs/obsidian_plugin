# Canvas Project Manager

A powerful Obsidian plugin that transforms Canvas into a full-featured project management tool with hierarchical entity management, visual organization, and optional Notion integration.

## Overview

Canvas Project Manager enables structured project planning directly within Obsidian Canvas by supporting multiple entity types organized in a hierarchy:

- **Milestones** - High-level project goals and deliverables
- **Stories** - User stories or feature descriptions (children of milestones)
- **Tasks** - Actionable work items (children of stories)
- **Decisions** - Architectural or design decisions that enable/unblock other entities
- **Documents** - Technical specs, designs, and documentation
- **Accomplishments** - Completed achievements and outcomes

## Features

### Multi-Entity Type Support
- **6 entity types** with distinct visual styles (border width, style, colors)
- **Hierarchical relationships** via `parent` frontmatter field
- **Dependency tracking** via `depends_on` and `enables` fields
- **Workstream organization** for grouping related entities

### Canvas Integration
- **Populate from vault**: Scan vault for entities and add them to canvas
- **Auto-layout**: Hierarchical positioning with milestones centered, dependencies fanning left
- **Visual differentiation**: Entity types have distinct border styles and colors
- **Visibility toggles**: Show/hide entity types (M/S/T/De/Do buttons)
- **Convert text nodes**: Right-click to convert text nodes to structured entities

### Archive Management
- **Automatic archiving**: Archived entities (status: archived) are moved to type-specific folders
- **Archive folder structure**: `archive/milestones/`, `archive/stories/`, `archive/tasks/`, etc.
- **Canvas cleanup**: Archived nodes are automatically removed from canvas
- **Archive exclusion**: Archived files are excluded from vault scans

### Entity Navigator
- **Navigate relationships**: Jump to parent, children, dependencies, documents, decisions
- **Context menu**: Right-click entities to see navigation options
- **Keyboard shortcuts**: Quick navigation with hotkeys
- **Index-based**: Fast lookups via in-memory entity index

### Notion Sync (Optional)
- **Bidirectional sync**: Create/update Notion database entries
- **Dependency sync**: Canvas edges sync to Notion relations
- **Archive sync**: Deleted notes archive corresponding Notion pages

### Smart File Management
- **Title-based naming**: Files named by title (not ID)
- **Duplicate prevention**: Prevents adding duplicate entities to canvas
- **Edge sync**: Canvas edges automatically sync to `depends_on` frontmatter

## Installation

### Manual Installation (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/ostanlabs/obsidian_plugin.git
   cd obsidian_plugin
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Copy files to your vault:
   ```bash
   mkdir -p /path/to/vault/.obsidian/plugins/canvas-project-manager
   cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/canvas-project-manager/
   ```

4. Reload Obsidian and enable the plugin in Settings → Community Plugins

## Entity Frontmatter Schema

Entities use YAML frontmatter with these fields:

```yaml
---
id: M-001                    # Entity ID (prefix + number)
type: milestone              # milestone, story, task, decision, document, accomplishment
title: "Project Alpha"       # Display title
status: active               # active, in_progress, completed, archived
parent: M-001                # Parent entity ID (for hierarchy)
depends_on:                  # Dependencies (entity IDs)
  - S-001
  - S-002
enables:                     # Entities this decision enables (for decisions)
  - T-003
workstream: engineering      # Workstream grouping
effort: Engineering          # Effort category
created_by_plugin: true      # Plugin-created marker
---
```

## Commands

| Command | Description |
|---------|-------------|
| **Project Canvas: Populate from vault** | Scan vault for entities and add to canvas |
| **Project Canvas: Reposition nodes (graph layout)** | Apply hierarchical layout to canvas nodes |
| **Project Canvas: Sync edges to dependencies** | Sync canvas edges to `depends_on` fields |
| **Project Canvas: Remove duplicate nodes** | Remove duplicate entity nodes from canvas |
| **Project Canvas: Strip IDs from filenames** | Remove ID prefixes from entity filenames |
| **Project Canvas: Initialize Notion database** | Create Notion database for sync |
| **Project Canvas: Sync current note to Notion** | Sync active note to Notion |
| **Project Canvas: Sync all canvas notes to Notion** | Sync all canvas entities to Notion |
| **Project Canvas: Regenerate templates** | Regenerate default entity templates |
| **Entity Navigator: Go to Parent** | Navigate to parent entity (Ctrl+Shift+P) |
| **Entity Navigator: Go to Children** | Navigate to child entities |
| **Entity Navigator: Go to Dependencies** | Navigate to dependency entities |
| **Entity Navigator: Go to Documents** | Navigate to related documents (Ctrl+Shift+D) |
| **Entity Navigator: Go to Decisions** | Navigate to related decisions (Ctrl+Shift+E) |
| **Entity Navigator: Go to Enabled Entities** | Navigate to entities enabled by a decision |
| **Entity Navigator: Rebuild Index** | Rebuild the entity relationship index |

## Visual Styling

### Entity Type Indicators

| Entity Type | Border Style | Default Color |
|-------------|--------------|---------------|
| Milestone | 3px solid | Purple (6) |
| Story | 2px solid | Blue (3) |
| Task | 1px solid | Green (2) |
| Decision | 2px dashed | Orange (4) |
| Document | 1px dotted | Yellow (5) |

### Status Indicators
- Entities display status via visual styling
- Archived entities are automatically moved to archive folders

## Layout Algorithm

The **Reposition nodes** command applies a workstream-based hierarchical layout:

1. **Milestones** are positioned in horizontal lanes by workstream
2. **Stories** fan out to the LEFT of their parent milestone
3. **Tasks** fan out further left of their parent story
4. **Decisions** and **Documents** are positioned with distinct spacing
5. **Cross-stream dependencies** are handled by aligning streams
6. **Orphan nodes** (no parent) are positioned at the end

### Layout Configuration
- Milestone spacing: 1200px horizontal
- Story spacing: 800px from milestone
- Task spacing: 700px from story
- Decision spacing: 800px (260px vertical offset)
- Document spacing: 1000px (460px vertical offset)

## Archive System

When **Populate from vault** runs, it automatically:

1. **Scans for archived files**: Checks `status: archived` or `archived: true` in frontmatter
2. **Moves to archive folders**: Files are moved to type-specific subfolders:
   ```
   archive/
   ├── milestones/
   ├── stories/
   ├── tasks/
   ├── decisions/
   ├── documents/
   └── accomplishments/
   ```
3. **Removes from canvas**: Archived nodes are removed from the canvas
4. **Excludes from scans**: Archive folder is excluded from future vault scans

## Development

### Setup

```bash
git clone https://github.com/ostanlabs/obsidian_plugin.git
cd obsidian_plugin
npm install
```

### Build Commands

```bash
npm run build      # Production build
npm run dev        # Development build with watch
npm test           # Run tests
npm run lint       # Lint code
```

### Project Structure

```
├── main.ts              # Plugin entry point (~5900 lines)
├── types.ts             # TypeScript interfaces
├── settings.ts          # Settings UI
├── styles.css           # Visual styling for entities
├── ui/                  # Modal components
│   └── StructuredItemModal.ts
├── util/                # Utility functions
│   ├── canvas.ts        # Canvas data operations
│   ├── canvasView.ts    # Canvas view manipulation
│   ├── entityNavigator.ts # Entity index and navigation
│   ├── fileNaming.ts    # File naming utilities
│   ├── frontmatter.ts   # Frontmatter parsing
│   ├── idGenerator.ts   # ID generation
│   ├── logger.ts        # Logging utilities
│   └── template.ts      # Template processing
├── notion/              # Notion API integration
│   ├── notionClient.ts  # Notion API client
│   └── contentSync.ts   # Content synchronization
└── tests/               # Test suites
```

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: Report bugs via [GitHub Issues](https://github.com/ostanlabs/obsidian_plugin/issues)
- **Documentation**: See the [docs](docs/) folder for detailed guides
