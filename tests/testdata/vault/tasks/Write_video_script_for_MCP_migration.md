---
id: T-085
type: task
title: Write video script for MCP migration
workstream: business
created_at: "2026-01-13T11:20:13.210Z"
updated_at: "2026-01-13T11:20:13.210Z"
parent: S-054
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-085")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```