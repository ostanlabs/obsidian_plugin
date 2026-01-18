---
id: T-111
type: task
title: Instrument workflow execution with OTEL SDK
workstream: engineering
status: Completed
created_at: "2026-01-14T18:42:09.883Z"
updated_at: "2026-01-15T04:11:42.424Z"
parent: S-072
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-111")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```