---
id: T-154
type: task
title: "Configure OTEL Collector pipelines (traces → Tempo, logs → Loki)"
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:57.561Z"
updated_at: "2026-01-15T12:53:41.825Z"
parent: S-082
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-154")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```