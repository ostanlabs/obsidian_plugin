---
id: T-168
type: task
title: "Add --transport CLI option (http|stdio)"
workstream: engineering
status: Completed
created_at: "2026-01-15T00:39:34.330Z"
updated_at: "2026-01-15T03:45:10.926Z"
parent: S-073
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-168")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```