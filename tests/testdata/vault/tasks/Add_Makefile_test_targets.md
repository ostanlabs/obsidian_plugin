---
id: T-225
type: task
title: Add Makefile test targets
workstream: engineering
created_at: "2026-01-15T13:02:13.720Z"
updated_at: "2026-01-15T13:02:13.720Z"
parent: S-094
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-225")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```