---
id: T-127
type: task
title: Install and configure Docker on target machines
workstream: infra
status: Completed
created_at: "2026-01-14T18:42:24.045Z"
updated_at: "2026-01-16T06:16:36.269Z"
parent: S-077
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-127")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```