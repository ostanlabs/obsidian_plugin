---
id: T-042
type: task
title: "Implement ael:configure tool (switch to config mode)"
workstream: engineering
status: Completed
created_at: "2026-01-12T13:10:45.793Z"
updated_at: "2026-01-13T10:14:56.498Z"
parent: S-044
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-042")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```