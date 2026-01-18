---
id: T-135
type: task
title: Deploy Kafka cluster to homelab
workstream: infra
status: Completed
created_at: "2026-01-14T18:42:41.121Z"
updated_at: "2026-01-15T12:53:19.927Z"
parent: S-079
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-135")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```