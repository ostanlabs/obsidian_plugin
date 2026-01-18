---
id: T-157
type: task
title: Create Kubernetes manifests for AEL stack
workstream: infra
status: In Progress
created_at: "2026-01-14T22:18:57.637Z"
updated_at: "2026-01-16T07:21:54.779Z"
parent: S-083
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-157")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```