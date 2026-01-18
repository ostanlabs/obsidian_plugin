---
id: T-077
type: task
title: Practice conference talk (3 iterations)
workstream: business
created_at: "2026-01-13T11:20:00.660Z"
updated_at: "2026-01-13T11:20:00.660Z"
parent: S-052
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-077")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```