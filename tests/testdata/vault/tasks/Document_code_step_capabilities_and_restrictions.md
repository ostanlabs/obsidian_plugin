---
id: T-237
type: task
title: Document code step capabilities and restrictions
workstream: engineering
created_at: "2026-01-15T13:03:21.467Z"
updated_at: "2026-01-15T13:03:21.467Z"
parent: S-097
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-237")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```