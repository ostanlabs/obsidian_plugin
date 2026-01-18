---
id: T-098
type: task
title: Document Docker usage
workstream: engineering
status: Completed
created_at: 2026-01-13T13:06:08.429Z
updated_at: 2026-01-15T04:51:47.768Z
parent: S-056
depends_on: ["T-096"]
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-098")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```