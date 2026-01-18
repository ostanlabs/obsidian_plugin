---
id: T-055
type: task
title: Create investor pitch deck (20 slides)
workstream: business
created_at: "2026-01-13T11:19:43.340Z"
updated_at: "2026-01-13T11:19:43.340Z"
parent: S-048
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-055")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```