---
id: T-185
type: task
title: Implement AELPlugin base class with hook methods
workstream: engineering
created_at: "2026-01-15T04:53:48.880Z"
updated_at: "2026-01-15T04:53:48.880Z"
parent: S-085
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-185")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```