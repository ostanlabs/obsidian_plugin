---
id: T-130
type: task
title: Create production docker-compose.homelab.yaml
workstream: infra
status: Completed
created_at: "2026-01-14T18:42:33.318Z"
updated_at: "2026-01-15T12:53:19.922Z"
parent: S-078
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-130")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```