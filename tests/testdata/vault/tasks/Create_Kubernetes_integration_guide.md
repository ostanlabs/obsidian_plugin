---
id: T-072
type: task
title: Create Kubernetes integration guide
workstream: business
created_at: "2026-01-13T11:19:55.508Z"
updated_at: "2026-01-13T11:19:55.508Z"
parent: S-051
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-072")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```