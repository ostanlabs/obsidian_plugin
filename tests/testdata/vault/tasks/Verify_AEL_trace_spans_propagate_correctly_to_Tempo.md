---
id: T-149
type: task
title: Verify AEL trace spans propagate correctly to Tempo
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:46.560Z"
updated_at: "2026-01-15T04:51:47.756Z"
parent: S-081
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-149")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```