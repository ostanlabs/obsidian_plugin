---
id: T-051
type: task
title: Record README GIF (15 seconds)
workstream: business
created_at: "2026-01-13T11:19:37.707Z"
updated_at: "2026-01-13T11:19:37.707Z"
parent: S-047
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-051")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```