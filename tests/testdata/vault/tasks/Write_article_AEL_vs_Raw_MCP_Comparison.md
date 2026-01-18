---
id: T-081
type: task
title: "Write article: AEL vs Raw MCP Comparison"
workstream: business
created_at: "2026-01-13T11:20:05.939Z"
updated_at: "2026-01-13T11:20:05.939Z"
parent: S-053
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-081")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```