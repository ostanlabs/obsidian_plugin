---
id: T-152
type: task
title: Add OTLP log exporter to AEL configuration
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:57.510Z"
updated_at: "2026-01-15T04:51:47.749Z"
parent: S-082
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-152")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```