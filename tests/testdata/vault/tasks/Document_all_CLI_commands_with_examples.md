---
id: T-231
type: task
title: Document all CLI commands with examples
workstream: engineering
created_at: "2026-01-15T13:03:13.754Z"
updated_at: "2026-01-15T13:03:13.754Z"
parent: S-096
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-231")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```