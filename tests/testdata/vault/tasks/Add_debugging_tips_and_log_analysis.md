---
id: T-246
type: task
title: Add debugging tips and log analysis
workstream: engineering
created_at: "2026-01-15T13:03:21.755Z"
updated_at: "2026-01-15T13:03:21.755Z"
parent: S-099
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-246")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```