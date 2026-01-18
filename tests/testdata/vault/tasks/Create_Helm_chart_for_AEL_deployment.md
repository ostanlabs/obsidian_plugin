---
id: T-158
type: task
title: Create Helm chart for AEL deployment
workstream: infra
created_at: "2026-01-14T22:18:57.668Z"
updated_at: "2026-01-14T22:18:57.668Z"
parent: S-083
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-158")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```