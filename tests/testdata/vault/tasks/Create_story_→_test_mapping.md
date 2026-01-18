---
id: T-108
type: task
title: Create story → test mapping
workstream: engineering
status: Not Started
created_at: "2026-01-13T13:06:08.617Z"
updated_at: "2026-01-15T03:17:17.567Z"
parent: 
depends_on: ["T-106","T-107"]
blocks: ["T-109"]
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-108")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```