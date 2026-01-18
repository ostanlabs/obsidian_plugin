---
id: T-188
type: task
title: Implement plugin loading from file path
workstream: engineering
created_at: "2026-01-15T04:53:55.159Z"
updated_at: "2026-01-15T04:53:55.159Z"
parent: S-086
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-188")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```