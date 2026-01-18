---
id: T-226
type: task
title: Configure test coverage reporting
workstream: engineering
created_at: "2026-01-15T13:02:13.750Z"
updated_at: "2026-01-15T13:02:13.750Z"
parent: S-094
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-226")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```