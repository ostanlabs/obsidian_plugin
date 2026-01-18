---
id: T-067
type: task
title: Create api-aggregator.yaml workflow
workstream: business
created_at: "2026-01-13T11:19:55.432Z"
updated_at: "2026-01-13T11:19:55.432Z"
parent: S-051
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-067")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```