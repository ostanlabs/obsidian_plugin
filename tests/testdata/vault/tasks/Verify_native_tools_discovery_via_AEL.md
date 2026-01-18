---
id: T-174
type: task
title: Verify native tools discovery via AEL
workstream: engineering
created_at: "2026-01-15T04:42:35.683Z"
updated_at: "2026-01-15T04:42:35.683Z"
parent: S-071
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-174")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```