---
id: T-197
type: task
title: Add PluginRegistry to WorkflowEngine constructor
workstream: engineering
created_at: "2026-01-15T04:54:09.113Z"
updated_at: "2026-01-15T04:54:09.113Z"
parent: S-088
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-197")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```