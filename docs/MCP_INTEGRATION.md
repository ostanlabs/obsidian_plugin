# MCP Integration Guide

> **Version:** 1.0
> **Date:** January 2026
> **Purpose:** How the Canvas Project Manager Plugin and Obsidian MCP Server work together

---

## Overview

The Canvas Project Manager ecosystem consists of two complementary components:

1. **Canvas Project Manager Plugin** (this repository) - Visual project management in Obsidian
2. **Obsidian MCP Server** ([obsidian-accomplishments-mcp](https://www.npmjs.com/package/obsidian-accomplishments-mcp)) - AI-native project management via Model Context Protocol

Both components work with the same vault and entity model, enabling seamless collaboration between human visual management and AI-assisted project operations.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Your Workflow                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐      ┌──────────────┐      ┌──────────┐              │
│   │ Obsidian │◄────►│  MCP Server  │◄────►│    AI    │              │
│   │  Plugin  │      │              │      │ Assistant│              │
│   └────┬─────┘      └──────┬───────┘      └──────────┘              │
│        │                   │                                        │
│        └───────────┬───────┘                                        │
│                    ▼                                                │
│            ┌───────────────┐                                        │
│            │ Obsidian Vault│                                        │
│            │  (Markdown)   │                                        │
│            └───────────────┘                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Shared Entity Model](#shared-entity-model)
3. [Use Cases](#use-cases)
4. [Setup and Configuration](#setup-and-configuration)
5. [Workflow Patterns](#workflow-patterns)
6. [Relationship Synchronization](#relationship-synchronization)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Core Concepts

### What is MCP?

**Model Context Protocol (MCP)** is an open protocol that enables AI assistants to interact with external tools and data sources. The Obsidian MCP Server implements this protocol to give AI assistants structured access to your project entities.

### Division of Responsibilities

| Component | Primary Responsibilities |
|-----------|-------------------------|
| **Plugin** | • Visual canvas layout and positioning<br>• Interactive entity creation via UI<br>• Canvas edge management<br>• Entity navigation and browsing<br>• Archive management |
| **MCP Server** | • AI-driven entity creation and updates<br>• Bulk operations and batch processing<br>• Project analysis and insights<br>• Dependency graph analysis<br>• Search and filtering<br>• Relationship reconciliation |

### Shared Responsibilities

Both components:
- Read and write entity markdown files
- Maintain bidirectional relationships
- Respect the same entity schemas
- Use the same archive structure
- Support workstream organization

---

## Shared Entity Model

Both the plugin and MCP server use the **same entity schemas** defined in [ENTITY_SCHEMAS.md](./ENTITY_SCHEMAS.md).

### Entity Types

| Type | ID Format | Description |
|------|-----------|-------------|
| **Milestone** | `M-001` | High-level project goals and deliverables |
| **Story** | `S-001` | User stories or feature descriptions |
| **Task** | `T-001` | Actionable work items |
| **Decision** | `DEC-001` | Architectural or design decisions |
| **Document** | `DOC-001` | Technical specs, ADRs, guides |
| **Feature** | `F-001` | Product features with tier/phase classification |

### Key Fields

All entities share these common fields:

```yaml
id: M-001                    # Unique identifier
type: milestone              # Entity type
title: "Q1 Product Launch"   # Display title
workstream: engineering      # Organizational grouping
status: Not Started          # Current status
archived: false              # Archive flag
canvas_source: projects/main.canvas  # Source canvas file
created_at: 2024-01-01T00:00:00Z
updated_at: 2024-01-15T00:00:00Z
```

### Workstream Normalization

The MCP server automatically normalizes workstream names to prevent fragmentation:

| Input | Normalized To |
|-------|---------------|
| `infrastructure`, `ops`, `devops` | `infra` |
| `eng`, `dev`, `development` | `engineering` |
| `biz` | `business` |
| `prod` | `product` |

When normalization occurs, the MCP server informs the AI assistant:
```
Entity S-042 created successfully.
Note: Workstream "infrastructure" was normalized to "infra" to match existing convention.
```

---

## Use Cases

### 1. Visual Planning + AI Execution

**Scenario:** You visually plan milestones on canvas, then ask AI to fill in details.

**Workflow:**
1. **Plugin:** Create milestone nodes on canvas with basic info
2. **AI via MCP:** "Create stories for M-001 based on the milestone description"
3. **Plugin:** Review and adjust story positions on canvas
4. **AI via MCP:** "Break down S-003 into tasks"

### 2. AI Analysis + Visual Review

**Scenario:** AI analyzes project state and identifies issues.

**Workflow:**
1. **AI via MCP:** "Analyze the project and identify blockers"
2. **AI via MCP:** Returns list of blocked entities and recommendations
3. **Plugin:** Navigate to blocked entities on canvas
4. **Plugin:** Visually inspect dependency chains
5. **AI via MCP:** "Update S-005 to remove dependency on DEC-002"

### 3. Bulk Operations + Visual Verification


### Pattern 1: Top-Down Planning

**Best for:** Starting new projects or milestones

```
1. Plugin: Create milestone on canvas
2. AI: "Create 5 stories for M-001 covering user authentication"
3. AI: "For each story, create 2-3 implementation tasks"
4. Plugin: Review hierarchy on canvas, adjust positions
5. AI: "Add dependencies between stories based on implementation order"
6. Plugin: Verify dependency edges on canvas
```

### Pattern 2: Bottom-Up Execution

**Best for:** Daily task management

```
1. AI: "What are my open tasks?"
2. AI: "Mark T-042 as completed"
3. Plugin: See task status update on canvas
4. AI: "What's next after T-042?"
5. Plugin: Navigate to next task on canvas
```

### Pattern 3: Decision-Driven Development

**Best for:** Architecture and design decisions

```
1. AI: "Create a decision about API versioning strategy"
2. AI: "This decision affects S-015, S-020, and DOC-003"
3. Plugin: Navigate to DEC-001 on canvas
4. Plugin: Visually inspect affected entities
5. AI: "Update DEC-001 status to decided"
6. AI: "What work is now unblocked by DEC-001?"
```

### Pattern 4: Workstream Management

**Best for:** Multi-team coordination

```
1. AI: "Show all engineering stories in M-001"
2. AI: "What's the status breakdown for engineering workstream?"
3. Plugin: Filter canvas to show only engineering entities
4. AI: "Create a milestone for infrastructure work"
5. Plugin: Position infra milestone separately on canvas
```

---

## Relationship Synchronization

Both the plugin and MCP server maintain **bidirectional relationships** automatically. When you update one side of a relationship, the reverse is automatically synced.

### Auto-Sync Examples

| Action | Automatic Update |
|--------|------------------|
| Set `S-001.parent = M-001` | Add `S-001` to `M-001.children` |
| Add `DEC-001` to `S-002.depends_on` | Add `S-002` to `DEC-001.blocks` |
| Set `S-015.implements = [DOC-005]` | Add `S-015` to `DOC-005.implemented_by` |
| Set `DEC-015.supersedes = DEC-001` | Set `DEC-001.superseded_by = DEC-015` |

### Relationship Types

See [ENTITY_SCHEMAS.md](./ENTITY_SCHEMAS.md) for complete relationship specifications.

**Key relationships:**
- **Hierarchy:** `parent` ↔ `children` (containment)
- **Dependency:** `depends_on` ↔ `blocks` (prerequisites)
- **Impact:** `affects` (one-way, Decision → entities)
- **Implementation:** `implements` ↔ `implemented_by` (spec delivery)
- **Supersession:** `supersedes` ↔ `superseded_by` (replacement)
- **Versioning:** `previous_version` ↔ `next_version` (evolution)

### Transitive Dependency Removal

Both components implement **transitive reduction** to keep dependency graphs clean:

```
Before:
  C depends_on: [B, A]
  B depends_on: [A]

After (transitive reduction):
  C depends_on: [B]      # A removed (redundant via B)
  B depends_on: [A]
```

This prevents visual clutter on canvas and maintains semantic clarity.

---

## Best Practices

### 1. Use AI for Bulk Operations

✅ **Good:**
```
AI: "Archive all completed stories in M-001"
AI: "Create 10 tasks for S-005 based on the acceptance criteria"
AI: "Update all engineering stories to priority High"
```

❌ **Avoid:**
- Manually archiving 50 completed stories via plugin UI
- Creating repetitive tasks one-by-one

### 2. Use Plugin for Visual Review

✅ **Good:**
- Review dependency chains on canvas
- Verify milestone hierarchy visually
- Inspect entity positioning and grouping
- Navigate between related entities

❌ **Avoid:**
- Asking AI to describe visual layout
- Using AI to navigate between entities

### 3. Leverage Workstream Normalization

✅ **Good:**
```
AI: "Create a story in the engineering workstream"
AI: "Create a task in the infra workstream"
```

The MCP server will normalize variations automatically.

❌ **Avoid:**
- Manually checking existing workstream names
- Creating inconsistent workstream values

### 4. Let AI Handle Relationship Sync

✅ **Good:**
```
AI: "Add S-002 as a child of M-001"
```

Both `S-002.parent` and `M-001.children` are updated automatically.

❌ **Avoid:**
- Manually updating both sides of relationships
- Worrying about reverse field consistency

### 5. Use Canvas for Spatial Organization

✅ **Good:**
- Group related entities visually on canvas
- Position milestones chronologically
- Separate workstreams spatially

❌ **Avoid:**
- Asking AI to manage canvas positions
- Expecting AI to understand spatial layout

### 6. Archive Completed Work

✅ **Good:**
```
AI: "Archive all completed entities in M-001"
Plugin: Verify archived entities are removed from canvas
```

❌ **Avoid:**
- Leaving completed work on active canvas
- Manually moving files to archive folders

---

## Troubleshooting

### Issue: AI Can't See Entities Created in Plugin

**Cause:** MCP server cache may be stale

**Solution:**
1. Restart your AI assistant
2. Or ask AI: "Refresh the entity cache"

### Issue: Relationship Not Syncing

**Cause:** One component may have stale data

**Solution:**
1. Reload Obsidian vault
2. Restart MCP server
3. Verify both entities exist in vault

### Issue: Workstream Fragmentation

**Symptom:** Multiple similar workstreams (e.g., "eng", "engineering", "dev")

**Solution:**
1. Use AI to standardize: "Update all 'eng' workstreams to 'engineering'"
2. MCP server will normalize future creations automatically

### Issue: Canvas Edges Not Showing

**Cause:** Plugin only shows edges for entities on canvas

**Solution:**
1. Ensure both source and target entities are on canvas
2. Use plugin's "Refresh Canvas" command
3. Check that relationship fields are correctly set in frontmatter

### Issue: Duplicate Entity IDs

**Cause:** Manual entity creation without ID validation

**Solution:**
1. Always use AI or plugin to create entities
2. Never manually create entity files
3. If duplicates exist, use AI: "Find and resolve duplicate entity IDs"

### Issue: Archive Folder Not Working

**Cause:** Incorrect folder structure

**Solution:**
1. Verify archive structure matches:
   ```
   archive/
   ├── milestones/
   ├── stories/
   ├── tasks/
   ├── decisions/
   ├── documents/
   └── features/
   ```
2. Use AI: "Archive S-001" (MCP handles folder structure)

---

## Advanced Topics

### Custom Workstreams

You can define custom workstreams beyond the defaults. Both components will respect any workstream value.

**Default workstreams:**
- `engineering`
- `business`
- `infra`
- `research`
- `design`
- `marketing`

**Custom examples:**
- `security`
- `compliance`
- `data`
- `platform`

### Multi-Canvas Projects

You can work with multiple canvas files:

```json
{
  "env": {
    "VAULT_PATH": "/path/to/vault",
    "DEFAULT_CANVAS": "projects/main.canvas"
  }
}
```

Then ask AI:
```
"Create a milestone on projects/q1-planning.canvas"
```

### Entity Search and Filtering

The MCP server provides powerful search capabilities:

```
AI: "Find all high-priority stories in engineering workstream"
AI: "Show all entities blocked by DEC-001"
AI: "List all documents that implement F-001"
AI: "What tasks are assigned to the infra workstream?"
```

### Dependency Analysis

Ask AI to analyze dependency chains:

```
AI: "What's the critical path for M-001?"
AI: "Show all transitive dependencies for S-005"
AI: "Find circular dependencies in the project"
AI: "What entities have no dependencies?"
```

---

## Reference Documentation

- **[ENTITY_SCHEMAS.md](./ENTITY_SCHEMAS.md)** - Complete entity type definitions
- **[CANVAS_LAYOUT.md](./CANVAS_LAYOUT.md)** - Canvas positioning and layout algorithm
- **[MCP Server README](https://www.npmjs.com/package/obsidian-accomplishments-mcp)** - MCP server documentation

---

## Support and Feedback

- **Plugin Issues:** [GitHub Issues](https://github.com/ostanlabs/internal-tools/issues)
- **MCP Server Issues:** [NPM Package](https://www.npmjs.com/package/obsidian-accomplishments-mcp)
- **Documentation:** This repository's `docs/` folder

---

**Last Updated:** January 2026
**Version:** 1.0

---

## Setup and Configuration

### Prerequisites

- Obsidian with Canvas Project Manager Plugin installed
- Node.js 18 or later
- AI assistant that supports MCP (e.g., Claude Desktop)

### Step 1: Install MCP Server

```bash
npm install -g obsidian-accomplishments-mcp
```

Or use npx (no installation):
```bash
npx obsidian-accomplishments-mcp
```

### Step 2: Configure AI Assistant

Add to your AI client's MCP configuration (e.g., Claude Desktop):

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-accomplishments-mcp"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/obsidian/vault",
        "DEFAULT_CANVAS": "projects/main.canvas"
      }
    }
  }
}
```

### Step 3: Verify Vault Structure

Ensure your vault has the required folder structure:

```
your-vault/
├── milestones/
├── stories/
├── tasks/
├── decisions/
├── documents/
├── features/
├── archive/
│   ├── milestones/
│   ├── stories/
│   ├── tasks/
│   ├── decisions/
│   ├── documents/
│   └── features/
└── projects/
    └── main.canvas
```

### Step 4: Test Integration

1. **In Obsidian:** Create a milestone using the plugin
2. **Ask AI:** "What milestones exist in the project?"
3. **AI should respond** with the milestone you just created

---

## Workflow Patterns

