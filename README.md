# Canvas Project Manager

[![GitHub release](https://img.shields.io/github/v/release/ostanlabs/obsidian_plugin.svg)](https://github.com/ostanlabs/obsidian_plugin/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Current Version:** v1.8.42

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

**Latest Version:** v1.8.42

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

### Feature Coverage

Track implementation, testing, and documentation status across features:

- **Feature Coverage View** - Sidebar view showing coverage status
- **Implementation tracking** - Which stories implement each feature
- **Test tracking** - Test references for each feature
- **Documentation tracking** - Which documents cover each feature

**Commands:**
- Open Feature Coverage View
- Refresh Feature Coverage
- Export Feature Coverage

See [Feature Coverage Guide](../obsidian_docs/docs/user-guide/feature-coverage.md) for workflows.

### Entity Navigator

Fast in-memory navigation across entity relationships:

- **Sidebar view** - Browse entity hierarchy and relationships
- **In-memory index** - ~100ms build time, <1ms lookups
- **Relationship traversal** - Navigate parent/children/dependencies/documents/decisions
- **Keyboard shortcuts** - Quick navigation without mouse

**Navigation Commands:**
- Go to Parent (Ctrl+Shift+P)
- Go to Children
- Go to Dependencies
- Go to Dependents
- Go to Documents (Ctrl+Shift+D)
- Go to Decisions (Ctrl+Shift+E)
- Go to Implementations
- Go to Features

See [Entity Navigator Guide](../obsidian_docs/docs/user-guide/entity-navigator.md) for details.

### Relationship Reconciliation

Maintain bidirectional relationship integrity:

- **Auto-sync** - Relationships automatically synced on entity updates
- **Manual reconciliation** - "Reconcile All Relationships" command
- **6 relationship types** - parent↔children, depends_on↔blocks, implements↔implemented_by, documents↔documented_by, affects↔decided_by, supersedes↔superseded_by
- **Data integrity** - Detect and fix inconsistencies

**Example:**
```yaml
# Story S-001
implements: [F-001]

# Feature F-001 (auto-synced)
implemented_by: [S-001]
```

See [Relationship Reconciliation Guide](../obsidian_docs/docs/user-guide/relationship-reconciliation.md) for workflows.

### Archive System

Entities with `status: archived` or `archived: true` are automatically:

**Flat Archive Structure:**
```
archive/
├── milestones/     # M-xxx.md
├── stories/        # S-xxx.md
├── tasks/          # T-xxx.md
├── decisions/      # DEC-xxx.md
├── documents/      # DOC-xxx.md
└── features/       # F-xxx.md
```

**Automatic Archival:**
- Moved to type-specific archive folders
- Removed from canvas
- Excluded from vault scans
- Relationships preserved

**Restoration:**
- "Unarchive Stories and Tasks" command
- Restores to original folders
- Sets `status: Not Started`
- Re-adds to canvas (optional)

**Canvas Integration:**
- "Remove Archived Nodes from Canvas" command
- Automatic cleanup during "Populate from vault"

See [Archive Structure Guide](../obsidian_docs/docs/user-guide/archive-structure.md) for workflows.

### Workstream Normalization

Workstream names are automatically normalized to standard slugs:

| Input | Normalized | CSS Class |
|-------|-----------|-----------|
| `eng`, `dev`, `development` | `engineering` | `canvas-workstream-engineering` |
| `infrastructure` | `infra` | `canvas-workstream-infra` |
| `biz` | `business` | `canvas-workstream-business` |
| `ux`, `ui` | `design` | `canvas-workstream-design` |
| `mktg` | `marketing` | `canvas-workstream-marketing` |
| `r&d`, `rnd` | `research` | `canvas-workstream-research` |

**Benefits:**
- Prevents fragmentation (no more `eng` vs `engineering` vs `dev`)
- Consistent CSS styling
- AI-friendly (agents can use natural language)

See [Workstream Normalization Guide](../obsidian_docs/docs/user-guide/workstream-normalization.md) for details.

### Notion Sync (Optional)
- One-way sync to Notion database
- Dependency sync via canvas edges
- Archive sync for deleted notes

### MCP Integration (Optional)
Enable HTTP server for AI-assisted project management via [obsidian-accomplishments-mcp](https://www.npmjs.com/package/obsidian-accomplishments-mcp). See [MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md) for details.

## Entity Frontmatter

Entities use YAML frontmatter with type-specific fields:

### Milestone Example
```yaml
---
id: M-001
type: milestone
title: "Q1 Launch"
status: in-progress
workstream: engineering
priority: high
target_date: 2024-03-31
owner: john@example.com
depends_on: []
implements: [F-001, F-002]
archived: false
canvas_source: projects/main.canvas
cssclasses:
  - canvas-milestone
  - canvas-workstream-engineering
  - canvas-status-in-progress
  - canvas-priority-high
created_at: 2024-01-01T10:00:00Z
updated_at: 2024-01-15T14:30:00Z
---
```

### Story Example
```yaml
---
id: S-001
type: story
title: "User Authentication"
status: in-progress
workstream: engineering
priority: high
parent: M-001
depends_on: [S-002]
implements: [F-001]
tasks: [T-001, T-002]
archived: false
canvas_source: projects/main.canvas
cssclasses:
  - canvas-story
  - canvas-workstream-engineering
  - canvas-status-in-progress
  - canvas-priority-high
created_at: 2024-01-05T10:00:00Z
updated_at: 2024-01-20T16:45:00Z
---
```

### Task Example
```yaml
---
id: T-001
type: task
title: "Implement JWT authentication"
status: in-progress
workstream: engineering
parent: S-001
depends_on: []
estimate_hrs: 8
actual_hrs: 6
assignee: john@example.com
archived: false
canvas_source: projects/main.canvas
cssclasses:
  - canvas-task
  - canvas-workstream-engineering
  - canvas-status-in-progress
created_at: 2024-01-10T10:00:00Z
updated_at: 2024-01-22T11:20:00Z
---
```

### Decision Example
```yaml
---
id: DEC-001
type: decision
title: "Use PostgreSQL for primary database"
status: decided
workstream: engineering
affects: [S-001, S-003]
decided_by: tech-lead
decided_on: 2024-01-15
archived: false
canvas_source: projects/main.canvas
cssclasses:
  - canvas-decision
  - canvas-workstream-engineering
  - canvas-status-decided
created_at: 2024-01-12T10:00:00Z
updated_at: 2024-01-15T15:00:00Z
---
```

### Feature Example
```yaml
---
id: F-001
type: feature
title: "User Authentication System"
status: in-progress
workstream: engineering
tier: core
phase: mvp
implemented_by: [S-001, S-002]
documented_by: [DOC-001]
decided_by: [DEC-001]
test_refs: ["auth.test.ts", "login.test.ts"]
archived: false
canvas_source: projects/main.canvas
cssclasses:
  - canvas-feature
  - canvas-workstream-engineering
  - canvas-status-in-progress
created_at: 2024-01-01T10:00:00Z
updated_at: 2024-01-20T14:00:00Z
---
```

**Key Fields:**
- `id` - Unique identifier (auto-generated)
- `type` - Entity type
- `title` - Display name
- `status` - Current status
- `workstream` - Organizational grouping (auto-normalized)
- `priority` - High/Medium/Low (Milestones and Stories only)
- `archived` - Archive flag
- `canvas_source` - Source canvas file
- `cssclasses` - Auto-generated CSS classes
- `created_at`, `updated_at` - Timestamps

See [Entity Schemas](../obsidian_docs/docs/reference/entity-schemas.md) for complete field definitions.

## Commands

The plugin provides 29 commands organized by category:

### Canvas Operations (9 commands)
| Command | Description |
|---------|-------------|
| **Populate from vault** | Scan vault for entities and add to canvas |
| **Reposition nodes** | Apply hierarchical layout |
| **Sync edges to dependencies** | Sync canvas edges to frontmatter |
| **Remove duplicate nodes** | Clean up duplicate entity nodes |
| **Remove archived nodes** | Remove archived entities from canvas |
| **Refresh canvas** | Reload and refresh canvas view |
| **Clear canvas** | Remove all nodes from canvas |
| **Export canvas data** | Export canvas to JSON |
| **Validate canvas** | Check canvas for errors |

### Navigation (8 commands)
| Command | Hotkey | Description |
|---------|--------|-------------|
| **Go to Parent** | Ctrl+Shift+P | Jump to parent entity |
| **Go to Children** | - | Jump to child entities |
| **Go to Dependencies** | - | Jump to dependencies |
| **Go to Dependents** | - | Jump to dependents |
| **Go to Documents** | Ctrl+Shift+D | Jump to related documents |
| **Go to Decisions** | Ctrl+Shift+E | Jump to related decisions |
| **Go to Implementations** | - | Jump to implementing stories |
| **Go to Features** | - | Jump to related features |

### Features (4 commands)
| Command | Description |
|---------|-------------|
| **Open Feature Coverage View** | Show feature implementation/test/doc status |
| **Refresh Feature Coverage** | Update coverage analysis |
| **Export Feature Coverage** | Export coverage report |
| **Reconcile All Relationships** | Fix bidirectional relationship inconsistencies |

### Notion Sync (3 commands)
| Command | Description |
|---------|-------------|
| **Initialize Notion database** | Create Notion database |
| **Sync current note** | Sync active note to Notion |
| **Sync all canvas notes** | Sync all entities to Notion |

### Utility (4 commands)
| Command | Description |
|---------|-------------|
| **Open Settings** | Open plugin settings |
| **Run Diagnostics** | Check plugin health |
| **Show Help** | Show command reference |
| **Toggle Debug Mode** | Enable/disable debug logging |

See [Plugin Commands Reference](../obsidian_docs/docs/reference/plugin-commands-complete.md) for complete documentation.

## Visual Styling

Entities are visually differentiated using CSS classes:

### Entity Type Styles

| Entity Type | Border Style | Default Color |
|-------------|--------------|---------------|
| Milestone | 3px solid | Purple |
| Story | 2px solid | Blue |
| Task | 1px solid | Green |
| Decision | 2px dashed | Orange |
| Document | 1px dotted | Yellow |
| Feature | 2px solid | Cyan |

### Workstream Colors

| Workstream | Color | CSS Class |
|------------|-------|-----------|
| Engineering | Blue | `canvas-workstream-engineering` |
| Business | Purple | `canvas-workstream-business` |
| Design | Pink | `canvas-workstream-design` |
| Marketing | Orange | `canvas-workstream-marketing` |
| Infrastructure | Yellow | `canvas-workstream-infra` |
| Research | Green | `canvas-workstream-research` |

### Status Indicators

Entities show status via 8px thick colored borders:
- **Not Started** - Gray
- **In Progress** - Blue
- **Completed** - Green
- **Blocked** - Red

### Priority Classes

Milestones and Stories support priority:
- **High** - Red accent
- **Medium** - Yellow accent
- **Low** - Gray accent

### CSS Class Patterns

All entities automatically get CSS classes:
- `canvas-{type}` - Entity type (e.g., `canvas-story`)
- `canvas-workstream-{slug}` - Workstream (e.g., `canvas-workstream-engineering`)
- `canvas-status-{slug}` - Status (e.g., `canvas-status-in-progress`)
- `canvas-priority-{slug}` - Priority (e.g., `canvas-priority-high`)

See [CSS Patterns Guide](../obsidian_docs/docs/user-guide/css-patterns.md) for customization.

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

For comprehensive documentation, see the [obsidian_docs](../obsidian_docs) repository:

### Quick Links

- **[Quick Start Guide](../obsidian_docs/guides/QUICK_START.md)** - Get started in 15 minutes
- **[User Guide](../obsidian_docs/guides/USER_GUIDE.md)** - Complete workflows and features
- **[Plugin Commands Reference](../obsidian_docs/docs/reference/plugin-commands-complete.md)** - All 29 commands documented
- **[Entity Schemas](../obsidian_docs/docs/reference/entity-schemas.md)** - Complete entity definitions

### Feature Guides

- [Feature Coverage](../obsidian_docs/docs/user-guide/feature-coverage.md) - Track implementation status
- [Entity Navigator](../obsidian_docs/docs/user-guide/entity-navigator.md) - Fast navigation
- [Relationship Reconciliation](../obsidian_docs/docs/user-guide/relationship-reconciliation.md) - Data integrity
- [Visual Canvas](../obsidian_docs/docs/user-guide/visual-canvas.md) - Canvas organization
- [CSS Patterns](../obsidian_docs/docs/user-guide/css-patterns.md) - Visual styling
- [Archive Structure](../obsidian_docs/docs/user-guide/archive-structure.md) - Archive workflows
- [Workstream Normalization](../obsidian_docs/docs/user-guide/workstream-normalization.md) - Auto-normalization

### Technical Documentation

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
