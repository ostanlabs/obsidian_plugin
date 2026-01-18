---
id: T-113
type: task
title: Configure OTEL PrometheusMetricReader for /metrics endpoint
workstream: engineering
status: Completed
created_at: "2026-01-14T18:42:09.942Z"
updated_at: "2026-01-15T04:11:42.429Z"
parent: S-072
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-113")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```