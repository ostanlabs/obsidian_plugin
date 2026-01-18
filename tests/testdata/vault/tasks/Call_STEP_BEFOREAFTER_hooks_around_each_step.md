---
id: T-199
type: task
title: Call STEP_BEFORE/AFTER hooks around each step
workstream: engineering
created_at: "2026-01-15T04:54:09.174Z"
updated_at: "2026-01-15T04:54:09.174Z"
parent: S-088
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-199")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```