---
id: T-019
type: task
title: "Implement `ael workflows show <name>` command"
workstream: engineering
status: Completed
created_at: "2025-12-20T16:35:36.714Z"
updated_at: "2026-01-13T10:14:56.499Z"
parent: S-041
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-019")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```