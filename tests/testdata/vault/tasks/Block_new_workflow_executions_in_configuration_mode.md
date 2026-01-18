---
id: T-045
type: task
title: Block new workflow executions in configuration mode
workstream: engineering
status: Completed
created_at: "2026-01-12T13:10:45.839Z"
updated_at: "2026-01-13T10:14:56.474Z"
parent: S-044
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-045")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```