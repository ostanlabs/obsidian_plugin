---
id: T-162
type: task
title: Set up K8s ingress for AEL services
workstream: infra
created_at: "2026-01-14T22:18:57.789Z"
updated_at: "2026-01-14T22:18:57.789Z"
parent: S-083
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-162")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```