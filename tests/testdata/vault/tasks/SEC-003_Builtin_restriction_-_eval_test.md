---
id: T-216
type: task
title: "SEC-003: Builtin restriction - eval test"
workstream: engineering
created_at: "2026-01-15T13:02:06.298Z"
updated_at: "2026-01-15T13:02:06.298Z"
parent: S-092
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-216")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```