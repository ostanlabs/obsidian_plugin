---
id: T-251
type: task
title: Create AEL build pipeline configuration
workstream: infra
created_at: "2026-01-16T05:49:55.308Z"
updated_at: "2026-01-16T05:49:55.308Z"
parent: S-100
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-251")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```