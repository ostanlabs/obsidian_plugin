---
id: T-189
type: task
title: Implement plugin loading from package
workstream: engineering
created_at: "2026-01-15T04:53:55.186Z"
updated_at: "2026-01-15T04:53:55.186Z"
parent: S-086
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-189")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```