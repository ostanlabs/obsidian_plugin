---
id: T-110
type: task
title: Define AEL core metrics schema (OTEL conventions)
workstream: engineering
status: Completed
created_at: "2026-01-14T18:42:09.853Z"
updated_at: "2026-01-15T04:11:42.422Z"
parent: S-072
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-110")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```