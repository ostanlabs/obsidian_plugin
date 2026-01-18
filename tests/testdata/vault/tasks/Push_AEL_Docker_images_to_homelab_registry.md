---
id: T-129
type: task
title: Push AEL Docker images to homelab registry
workstream: infra
status: Not Started
created_at: "2026-01-14T18:42:33.287Z"
updated_at: "2026-01-16T07:21:20.194Z"
parent: S-078
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-129")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```