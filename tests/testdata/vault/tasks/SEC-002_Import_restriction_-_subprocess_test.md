---
id: T-215
type: task
title: "SEC-002: Import restriction - subprocess test"
workstream: engineering
created_at: "2026-01-15T13:02:06.266Z"
updated_at: "2026-01-15T13:02:06.266Z"
parent: S-092
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-215")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```