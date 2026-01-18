---
id: T-146
type: task
title: Create log exploration dashboard in Grafana
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:46.488Z"
updated_at: "2026-01-15T12:53:41.827Z"
parent: S-080
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-146")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```