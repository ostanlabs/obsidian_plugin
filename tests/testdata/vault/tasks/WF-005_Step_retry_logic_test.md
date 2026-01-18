---
id: T-213
type: task
title: "WF-005: Step retry logic test"
workstream: engineering
created_at: "2026-01-15T13:02:00.802Z"
updated_at: "2026-01-15T13:02:00.802Z"
parent: S-091
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-213")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```