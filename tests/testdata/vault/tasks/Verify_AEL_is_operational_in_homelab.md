---
id: T-133
type: task
title: Verify AEL is operational in homelab
workstream: infra
status: Not Started
created_at: "2026-01-14T18:42:33.413Z"
updated_at: "2026-01-16T01:09:37.262Z"
parent: S-078
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-133")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```