---
id: T-094
type: task
title: Create AEL Dockerfile
workstream: engineering
status: Completed
created_at: "2026-01-13T13:06:08.345Z"
updated_at: "2026-01-15T04:51:47.763Z"
parent: 
blocks: ["T-096"]
goal: []
updated: 2026-01-17T07:16:05.672Z
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-094")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```