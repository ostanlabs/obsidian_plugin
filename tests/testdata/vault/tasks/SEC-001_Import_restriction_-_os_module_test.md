---
id: T-214
type: task
title: "SEC-001: Import restriction - os module test"
workstream: engineering
created_at: "2026-01-15T13:02:06.233Z"
updated_at: "2026-01-15T13:02:06.233Z"
parent: S-092
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-214")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```