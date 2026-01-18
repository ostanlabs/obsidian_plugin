---
id: T-145
type: task
title: Configure AEL to ship logs to Loki
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:46.465Z"
updated_at: "2026-01-15T04:51:47.752Z"
parent: S-080
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-145")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```