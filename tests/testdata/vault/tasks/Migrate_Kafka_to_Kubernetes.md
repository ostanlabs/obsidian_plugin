---
id: T-159
type: task
title: Migrate Kafka to Kubernetes
workstream: infra
created_at: "2026-01-14T22:18:57.705Z"
updated_at: "2026-01-14T22:18:57.705Z"
parent: S-083
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-159")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```