---
id: T-122
type: task
title: Export dashboards as JSON for version control
workstream: engineering
status: Not Started
created_at: "2026-01-14T18:42:17.254Z"
updated_at: "2026-01-15T03:54:16.035Z"
parent: S-076
goal: 
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-122")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```