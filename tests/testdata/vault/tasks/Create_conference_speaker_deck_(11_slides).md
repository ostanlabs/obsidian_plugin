---
id: T-075
type: task
title: Create conference speaker deck (11 slides)
workstream: business
created_at: "2026-01-13T11:20:00.609Z"
updated_at: "2026-01-13T11:20:00.609Z"
parent: S-052
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-075")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```