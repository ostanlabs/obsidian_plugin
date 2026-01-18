---
id: T-263
type: task
title: Test local build with mkdocs serve
workstream: engineering
status: Not Started
created_at: "2026-01-17T15:58:57.637Z"
updated_at: "2026-01-17T15:59:19.825Z"
parent: S-101
goal: 
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-263")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```