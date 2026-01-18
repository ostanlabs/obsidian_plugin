---
id: T-030
type: task
title: Configure Claude Desktop MCP integration
workstream: engineering
status: Completed
created_at: "2026-01-12T03:03:34.827Z"
updated_at: "2026-01-12T12:15:08.782Z"
parent: S-004
goal: Add AEL to Claude Desktop's claude_desktop_config.json MCP servers
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-030")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```