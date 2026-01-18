---
id: T-079
type: task
title: Record backup demo video
workstream: business
created_at: "2026-01-13T11:20:00.691Z"
updated_at: "2026-01-13T11:20:00.691Z"
parent: S-052
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-079")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```