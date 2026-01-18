---
id: T-107
type: task
title: Extract user stories from demo specs
workstream: engineering
status: Not Started
created_at: "2026-01-13T13:06:08.597Z"
updated_at: "2026-01-15T03:17:17.565Z"
parent: 
depends_on: ["T-105"]
blocks: ["T-108"]
goal: []
updated: 2026-01-16T20:48:42.492Z
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-107")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```