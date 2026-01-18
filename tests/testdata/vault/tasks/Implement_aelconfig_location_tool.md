---
id: T-040
type: task
title: "Implement ael:config_location tool"
workstream: engineering
status: Completed
created_at: "2026-01-12T13:10:45.768Z"
updated_at: "2026-01-13T10:14:56.496Z"
parent: S-044
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-040")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```