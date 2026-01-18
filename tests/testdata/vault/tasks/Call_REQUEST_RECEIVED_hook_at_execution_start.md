---
id: T-198
type: task
title: Call REQUEST_RECEIVED hook at execution start
workstream: engineering
created_at: "2026-01-15T04:54:09.142Z"
updated_at: "2026-01-15T04:54:09.142Z"
parent: S-088
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-198")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```