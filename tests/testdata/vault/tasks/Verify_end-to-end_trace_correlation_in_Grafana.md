---
id: T-155
type: task
title: Verify end-to-end trace correlation in Grafana
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:57.586Z"
updated_at: "2026-01-15T12:53:41.832Z"
parent: S-082
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-155")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```