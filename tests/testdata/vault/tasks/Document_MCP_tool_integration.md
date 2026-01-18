---
id: T-245
type: task
title: Document MCP tool integration
workstream: engineering
created_at: "2026-01-15T13:03:21.724Z"
updated_at: "2026-01-15T13:03:21.724Z"
parent: S-099
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-245")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```