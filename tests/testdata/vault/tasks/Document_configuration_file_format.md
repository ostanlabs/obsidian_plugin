---
id: T-232
type: task
title: Document configuration file format
workstream: engineering
created_at: "2026-01-15T13:03:13.788Z"
updated_at: "2026-01-15T13:03:13.788Z"
parent: S-096
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-232")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```