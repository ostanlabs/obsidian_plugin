# Canvas Project Manager

A powerful Obsidian plugin that transforms Canvas into a full-featured project management tool with hierarchical entity management, visual organization, and optional Notion integration.

## Overview

Canvas Project Manager enables structured project planning directly within Obsidian Canvas by supporting multiple entity types organized in a hierarchy:

| Type | ID Prefix | Description |
|------|-----------|-------------|
| **Milestone** | M-xxx | High-level project goals and deliverables |
| **Story** | S-xxx | User stories or feature descriptions |
| **Task** | T-xxx | Actionable work items |
| **Decision** | DEC-xxx | Architectural or design decisions |
| **Document** | DOC-xxx | Technical specs, designs, and documentation |
| **Feature** | F-xxx | Product features with tier/phase classification |

## Quick Start

### Prerequisites

- **Node.js** v16 or higher
- **Obsidian** (latest version)

### Installation

```bash
# Clone and build
git clone https://github.com/ostanlabs/obsidian_plugin.git
cd obsidian_plugin
npm install
npm run build

# Copy to your vault
mkdir -p /path/to/vault/.obsidian/plugins/canvas-project-manager
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/canvas-project-manager/
```

Then in Obsidian: **Settings → Community Plugins → Enable Canvas Project Manager**

### First Steps

1. Create or open a Canvas file (`.canvas`)
2. Press `Ctrl+P` (or `Cmd+P` on Mac) to open command palette
3. Run **"Project Canvas: Populate from vault"** to scan for entities
4. Run **"Project Canvas: Reposition nodes"** to apply hierarchical layout

## Features

### Canvas Integration
- **Populate from vault** - Scan vault for entities and add them to canvas
- **Auto-layout** - Hierarchical positioning with workstream-based lanes
- **Visual differentiation** - Entity types have distinct border styles and colors
- **Visibility toggles** - Show/hide entity types (M/S/T/De/Do buttons)
- **Convert text nodes** - Right-click to convert text nodes to structured entities

### Entity Navigator
- **Navigate relationships** - Jump to parent, children, dependencies, documents, decisions
- **Context menu** - Right-click entities to see navigation options
- **Keyboard shortcuts** - `Ctrl+Shift+P` (parent), `Ctrl+Shift+D` (documents), `Ctrl+Shift+E` (decisions)

### Archive System
Entities with `status: archived` are automatically:
- Moved to type-specific folders (`archive/milestones/`, `archive/stories/`, etc.)
- Removed from canvas
- Excluded from future vault scans

### Notion Sync (Optional)
- One-way sync to Notion database
- Dependency sync via canvas edges
- Archive sync for deleted notes

### MCP Integration (Optional)
Enable HTTP server for AI-assisted project management via [obsidian-accomplishments-mcp](https://www.npmjs.com/package/obsidian-accomplishments-mcp). See [MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md) for details.

## Entity Frontmatter

Entities use YAML frontmatter:

```yaml
---
id: S-001
type: story
title: "User Authentication"
status: in_progress
parent: M-001                # Hierarchy
depends_on:                  # Dependencies
  - S-002
workstream: engineering      # Grouping
---
```

## Commands

### Canvas Operations
| Command | Description |
|---------|-------------|
| **Populate from vault** | Scan vault for entities and add to canvas |
| **Reposition nodes** | Apply hierarchical layout |
| **Sync edges to dependencies** | Sync canvas edges to frontmatter |
| **Remove duplicate nodes** | Clean up duplicate entity nodes |

### Entity Navigation
| Command | Hotkey | Description |
|---------|--------|-------------|
| **Go to Parent** | Ctrl+Shift+P | Jump to parent entity |
| **Go to Children** | - | Jump to child entities |
| **Go to Documents** | Ctrl+Shift+D | Jump to related documents |
| **Go to Decisions** | Ctrl+Shift+E | Jump to related decisions |

### Notion Sync
| Command | Description |
|---------|-------------|
| **Initialize Notion database** | Create Notion database |
| **Sync current note** | Sync active note to Notion |
| **Sync all canvas notes** | Sync all entities to Notion |

## Visual Styling

| Entity Type | Border Style | Default Color |
|-------------|--------------|---------------|
| Milestone | 3px solid | Purple |
| Story | 2px solid | Blue |
| Task | 1px solid | Green |
| Decision | 2px dashed | Orange |
| Document | 1px dotted | Yellow |
| Feature | 2px solid | Cyan |

## Troubleshooting

### "No active canvas found"
Make sure you have a `.canvas` file open and focused.

### Entities not appearing on canvas
- Check entity files have valid frontmatter with `type` field
- Ensure files are not in the `archive/` folder
- Check console logs (`Ctrl+Shift+I`) for parsing errors

### Notion sync fails
1. Verify integration token is correct (starts with `secret_`)
2. Check parent page ID is correct
3. Ensure page is shared with integration
4. Run "Initialize Notion Database" first

## Documentation

- **[DEVELOPMENT.md](docs/DEVELOPMENT.md)** - Development setup and contribution guide
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Technical architecture
- **[ENTITY_SCHEMAS.md](docs/ENTITY_SCHEMAS.md)** - Entity type definitions and relationships
- **[CANVAS_LAYOUT.md](docs/CANVAS_LAYOUT.md)** - Positioning algorithm details
- **[USER_SCENARIOS.md](docs/USER_SCENARIOS.md)** - Use cases, behaviors, and edge cases
- **[MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md)** - AI integration via MCP

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.
