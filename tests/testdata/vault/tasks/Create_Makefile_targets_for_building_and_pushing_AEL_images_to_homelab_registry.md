---
id: T-253
type: task
title: Create Makefile targets for building and pushing AEL images to homelab registry
workstream: infra
status: Not Started
created_at: "2026-01-16T07:05:46.693Z"
updated_at: "2026-01-16T07:21:32.719Z"
parent: S-083
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-253")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```