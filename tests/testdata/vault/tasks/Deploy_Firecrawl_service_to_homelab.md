---
id: T-138
type: task
title: Deploy Firecrawl service to homelab
workstream: infra
status: Completed
created_at: "2026-01-14T18:42:41.215Z"
updated_at: "2026-01-15T12:53:19.934Z"
parent: S-079
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-138")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```