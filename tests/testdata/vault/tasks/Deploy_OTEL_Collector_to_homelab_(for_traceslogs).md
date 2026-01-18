---
id: T-153
type: task
title: Deploy OTEL Collector to homelab (for traces/logs)
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:57.535Z"
updated_at: "2026-01-15T12:53:33.086Z"
parent: S-082
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-153")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```