---
id: T-024
type: task
title: Create internal/ael-config.yaml
workstream: engineering
status: Completed
created_at: "2026-01-12T03:03:34.763Z"
updated_at: "2026-01-12T04:39:27.354Z"
parent: S-004
goal: Config file that connects to native_tools MCP server from agent submodule via stdio transport
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-024")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```