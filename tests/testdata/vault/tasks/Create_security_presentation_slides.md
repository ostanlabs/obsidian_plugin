---
id: T-091
type: task
title: Create security presentation slides
workstream: business
created_at: "2026-01-13T11:20:18.509Z"
updated_at: "2026-01-13T11:20:18.509Z"
parent: S-055
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-091")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```