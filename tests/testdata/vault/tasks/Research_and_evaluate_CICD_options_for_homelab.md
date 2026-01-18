---
id: T-247
type: task
title: Research and evaluate CI/CD options for homelab
workstream: infra
status: Completed
created_at: "2026-01-16T05:49:55.166Z"
updated_at: "2026-01-16T05:50:33.467Z"
parent: S-100
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-247")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```