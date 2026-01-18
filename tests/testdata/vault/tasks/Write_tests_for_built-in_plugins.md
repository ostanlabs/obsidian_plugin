---
id: T-203
type: task
title: Write tests for built-in plugins
workstream: engineering
created_at: "2026-01-15T04:54:09.301Z"
updated_at: "2026-01-15T04:54:09.301Z"
parent: S-089
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-203")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```