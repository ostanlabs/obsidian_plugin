---
id: T-210
type: task
title: "WF-002: Workflow with code step test"
workstream: engineering
created_at: "2026-01-15T13:02:00.709Z"
updated_at: "2026-01-15T13:02:00.709Z"
parent: S-091
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-210")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```