---
id: T-114
type: task
title: Add OTEL telemetry configuration to ael-config.yaml
workstream: engineering
status: Completed
created_at: "2026-01-14T18:42:09.970Z"
updated_at: "2026-01-15T04:11:42.431Z"
parent: S-072
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-114")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```