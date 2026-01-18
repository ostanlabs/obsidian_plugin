---
id: T-027
type: task
title: Create file-operations workflow
workstream: engineering
status: Completed
created_at: "2026-01-12T03:03:34.797Z"
updated_at: "2026-01-12T04:40:02.533Z"
parent: S-004
goal: "Workflow demonstrating filesystem tools: fs_write, fs_read, fs_list"
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-027")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```