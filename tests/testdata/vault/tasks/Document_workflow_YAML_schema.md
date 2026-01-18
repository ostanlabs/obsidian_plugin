---
id: T-235
type: task
title: Document workflow YAML schema
workstream: engineering
created_at: "2026-01-15T13:03:21.406Z"
updated_at: "2026-01-15T13:03:21.406Z"
parent: S-097
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-235")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```