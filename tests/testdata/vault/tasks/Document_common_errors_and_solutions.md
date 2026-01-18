---
id: T-244
type: task
title: Document common errors and solutions
workstream: engineering
created_at: "2026-01-15T13:03:21.694Z"
updated_at: "2026-01-15T13:03:21.694Z"
parent: S-099
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-244")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```