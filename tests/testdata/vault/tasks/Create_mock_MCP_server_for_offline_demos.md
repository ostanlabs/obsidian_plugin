---
id: T-050
type: task
title: Create mock MCP server for offline demos
workstream: business
created_at: "2026-01-13T11:19:37.695Z"
updated_at: "2026-01-13T11:19:37.695Z"
parent: S-046
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-050")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```