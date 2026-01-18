---
id: T-065
type: task
title: Practice enterprise leader demo
workstream: business
created_at: "2026-01-13T11:19:49.220Z"
updated_at: "2026-01-13T11:19:49.220Z"
parent: S-050
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-065")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```