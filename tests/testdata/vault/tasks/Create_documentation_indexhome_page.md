---
id: T-230
type: task
title: Create documentation index/home page
workstream: engineering
created_at: "2026-01-15T13:03:13.721Z"
updated_at: "2026-01-15T13:03:13.721Z"
parent: S-095
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-230")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```