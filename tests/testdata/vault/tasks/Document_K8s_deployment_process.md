---
id: T-163
type: task
title: Document K8s deployment process
workstream: infra
status: In Progress
created_at: "2026-01-14T22:18:57.812Z"
updated_at: "2026-01-16T05:52:36.170Z"
parent: S-083
goal: 
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-163")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```