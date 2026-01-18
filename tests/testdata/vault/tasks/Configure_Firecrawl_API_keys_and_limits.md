---
id: T-139
type: task
title: Configure Firecrawl API keys and limits
workstream: infra
status: Completed
created_at: "2026-01-14T18:42:41.245Z"
updated_at: "2026-01-15T12:53:19.937Z"
parent: S-079
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-139")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```