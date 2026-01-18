---
id: T-036
type: task
title: "Implement ael:config_get tool"
workstream: engineering
status: Completed
created_at: "2026-01-12T13:10:45.722Z"
updated_at: "2026-01-13T10:14:56.485Z"
parent: S-044
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-036")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```