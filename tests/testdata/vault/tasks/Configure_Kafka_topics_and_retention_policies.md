---
id: T-136
type: task
title: Configure Kafka topics and retention policies
workstream: infra
status: Completed
created_at: "2026-01-14T18:42:41.153Z"
updated_at: "2026-01-15T12:53:19.930Z"
parent: S-079
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-136")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```