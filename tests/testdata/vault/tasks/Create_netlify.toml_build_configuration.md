---
id: T-261
type: task
title: Create netlify.toml build configuration
workstream: engineering
status: Not Started
created_at: "2026-01-17T15:58:57.565Z"
updated_at: "2026-01-17T15:59:19.822Z"
parent: S-101
goal: 
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-261")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```