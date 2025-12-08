# Structured Canvas Notes — Plugin Spec v2.1

## Overview

This plugin enables “structured notes” inside Obsidian Canvas: visually represented nodes that correspond to markdown notes with metadata, with support for a compact / expanded view, custom display names, shape styling, and easy creation.

Structured‑notes are ones created and managed by this plugin; native Canvas nodes / plain notes remain unaffected.

---

## Data Model & Metadata Schema

### Markdown note (vault, `.md`)

Each structured note must begin with frontmatter YAML, for example:

```yaml
type: task | accomplishment
title: <string>               # human‑readable title
id: <string>                  # e.g. T001, A010, A005 etc.
effort: <string>              # from user‑configurable list (e.g. Engineering, Business, Research, …)
status: Not Started | In Progress | Completed | Blocked
priority: Low | Medium | High | Critical
parent: <string>              # optional — parent project/milestone name
created_by_plugin: true
notion_page_id: <string|null> # if synced to Notion
```

The rest of the file can contain arbitrary content (task description, checklists, notes, etc).

---

### Canvas node metadata (in the `.canvas` JSON)

For each node corresponding to a structured note, the plugin uses these fields in the node object:

```json
{
  "id": "<node‑uuid>",
  "type": "file",
  "file": "<relative/path/to/note.md>",
  "metadata": {
    "plugin": "structured‑canvas‑notes",
    "collapsed": <boolean>,            // true = collapsed, false = expanded
    "alias": <string>,                 // human‑readable label (overrides file name)
    "shape": "task" | "accomplishment",
    "effortColor": <string>            // optional: allow custom or per‑effort color
  },
  "x": <number>,
  "y": <number>,
  "width": <number>,
  "height": <number>,
  "color": <string> or color index     // for effort‑based or custom coloring
}
```

---

## UI / Rendering Behavior

### Collapse / Expand

- If `collapsed = true`: node renders in compact mode — only shows alias or title.
- If `collapsed = false`: node renders expanded — shows title + up to three metadata properties.

### Double‑Click Opening

Double‑clicking opens the linked markdown file in a new tab.

### Context‑Menu: Convert to Structured Note

- Right‑click on unstructured node → **Convert to Structured Note**.
- Prompts for metadata, creates `.md`, attaches metadata, updates Canvas node.

### Shape & Color Styling

- `task` vs `accomplishment` get different shapes.
- Effort avenues determine color.

---

## Plugin Settings

- Templates for task/accomplishment notes.
- Default folder for created notes.
- Effort avenues (editable list).
- Color mappings for efforts.
- Select which 3 fields to show when expanded.
- Toggle whether to show ID.
- Default collapse state.
- Shape customization.

---

## Commands / Actions

| Action | Behavior |
|--------|----------|
| Convert to Structured Note | Converts node, creates file, attaches metadata |
| Toggle Collapse/Expand | Switch collapsed state |
| Double‑Click Note | Opens note in new tab |
| Create New Structured Note | Optional command |

---

## Behavior When Plugin Disabled

- Nodes remain normal file nodes.
- No collapse/expand or custom rendering.
- No data loss.

---

## Scope Summary (v2.1)

- Conversion of nodes → structured notes.
- Collapsed/expanded rendering.
- Display of 3 metadata fields.
- Shape & color coding.
- Double‑click opening.
- Settings panel.

---

## Out‑of‑Scope for v2.1

- Full markdown embedding.
- Automatic dependency graphing.
- Notion sync.

---

## Rationale

This spec delivers a powerful planning workflow with minimal risk, extending Canvas in stable and maintainable ways.

