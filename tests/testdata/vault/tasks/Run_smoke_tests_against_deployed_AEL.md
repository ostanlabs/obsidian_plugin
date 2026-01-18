---
id: T-134
type: task
title: Run smoke tests against deployed AEL
workstream: infra
status: Not Started
created_at: "2026-01-14T18:42:33.443Z"
updated_at: "2026-01-16T01:09:37.265Z"
parent: S-078
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-134")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```