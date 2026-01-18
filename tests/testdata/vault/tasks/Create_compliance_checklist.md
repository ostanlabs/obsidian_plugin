---
id: T-093
type: task
title: Create compliance checklist
workstream: business
created_at: "2026-01-13T11:20:18.536Z"
updated_at: "2026-01-13T11:20:18.536Z"
parent: S-055
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-093")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```