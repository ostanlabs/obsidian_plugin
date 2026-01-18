---
id: T-124
type: task
title: Define AEL stack resource requirements
workstream: infra
status: Completed
created_at: "2026-01-14T18:42:23.966Z"
updated_at: "2026-01-15T12:54:36.262Z"
parent: S-077
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-124")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```