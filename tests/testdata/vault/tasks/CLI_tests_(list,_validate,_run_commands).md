---
id: T-223
type: task
title: "CLI tests (list, validate, run commands)"
workstream: engineering
created_at: "2026-01-15T13:02:13.642Z"
updated_at: "2026-01-15T13:02:13.642Z"
parent: S-093
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-223")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```