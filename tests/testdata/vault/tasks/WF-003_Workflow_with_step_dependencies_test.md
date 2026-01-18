---
id: T-211
type: task
title: "WF-003: Workflow with step dependencies test"
workstream: engineering
created_at: "2026-01-15T13:02:00.741Z"
updated_at: "2026-01-15T13:02:00.741Z"
parent: S-091
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-211")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```