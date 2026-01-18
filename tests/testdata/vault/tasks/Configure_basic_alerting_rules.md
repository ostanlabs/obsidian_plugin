---
id: T-121
type: task
title: Configure basic alerting rules
workstream: engineering
status: Not Started
created_at: "2026-01-14T18:42:17.228Z"
updated_at: "2026-01-15T03:54:16.034Z"
parent: S-076
goal: 
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-121")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```