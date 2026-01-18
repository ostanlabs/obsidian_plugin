---
id: T-217
type: task
title: "SEC-004: Builtin restriction - exec test"
workstream: engineering
created_at: "2026-01-15T13:02:06.329Z"
updated_at: "2026-01-15T13:02:06.329Z"
parent: S-092
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-217")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```