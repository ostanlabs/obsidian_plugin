---
id: T-022
type: task
title: Implement `ael tools refresh` command
workstream: engineering
status: Completed
created_at: "2025-12-20T16:35:36.715Z"
updated_at: "2026-01-13T10:14:56.483Z"
parent: S-041
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-022")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```