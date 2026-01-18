---
id: T-242
type: task
title: Create API integration workflow example
workstream: engineering
created_at: "2026-01-15T13:03:21.633Z"
updated_at: "2026-01-15T13:03:21.633Z"
parent: S-098
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-242")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```