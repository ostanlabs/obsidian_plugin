---
id: T-222
type: task
title: "FE-003: tools/call error handling test"
workstream: engineering
created_at: "2026-01-15T13:02:13.610Z"
updated_at: "2026-01-15T13:02:13.610Z"
parent: S-093
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-222")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```