---
id: T-137
type: task
title: Verify Kafka connectivity from AEL
workstream: infra
status: Not Started
created_at: "2026-01-14T18:42:41.185Z"
updated_at: "2026-01-16T01:09:37.268Z"
parent: S-079
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-137")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```