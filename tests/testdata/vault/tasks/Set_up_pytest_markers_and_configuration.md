---
id: T-208
type: task
title: Set up pytest markers and configuration
workstream: engineering
created_at: "2026-01-15T13:01:53.398Z"
updated_at: "2026-01-15T13:01:53.398Z"
parent: S-090
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-208")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```