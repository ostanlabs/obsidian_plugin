---
id: T-241
type: task
title: Create data processing workflow example
workstream: engineering
created_at: "2026-01-15T13:03:21.601Z"
updated_at: "2026-01-15T13:03:21.601Z"
parent: S-098
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-241")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```