---
id: T-150
type: task
title: Create trace exploration dashboard in Grafana
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:46.585Z"
updated_at: "2026-01-15T12:53:41.829Z"
parent: S-081
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-150")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```