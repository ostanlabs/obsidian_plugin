---
id: T-028
type: task
title: Create python-exec-explicit.yaml workflow
workstream: engineering
status: Completed
created_at: "2026-01-12T03:03:34.807Z"
updated_at: "2026-01-12T04:40:11.746Z"
parent: S-004
goal: "Demonstrate both implicit (code:) and explicit (tool: python_exec) modes"
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-028")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```