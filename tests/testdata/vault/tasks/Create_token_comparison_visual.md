---
id: T-056
type: task
title: Create token comparison visual
workstream: business
created_at: "2026-01-13T11:19:43.354Z"
updated_at: "2026-01-13T11:19:43.354Z"
parent: S-048
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-056")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```