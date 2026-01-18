---
id: T-116
type: task
title: Deploy Grafana to homelab
workstream: engineering
status: Completed
created_at: "2026-01-14T18:42:17.082Z"
updated_at: "2026-01-15T12:53:33.066Z"
parent: S-076
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-116")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```