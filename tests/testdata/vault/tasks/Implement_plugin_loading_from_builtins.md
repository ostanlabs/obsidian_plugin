---
id: T-187
type: task
title: Implement plugin loading from builtins
workstream: engineering
created_at: "2026-01-15T04:53:55.131Z"
updated_at: "2026-01-15T04:53:55.131Z"
parent: S-086
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-187")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```