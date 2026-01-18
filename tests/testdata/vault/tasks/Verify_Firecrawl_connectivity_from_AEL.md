---
id: T-140
type: task
title: Verify Firecrawl connectivity from AEL
workstream: infra
status: Not Started
created_at: "2026-01-14T18:42:41.277Z"
updated_at: "2026-01-16T01:09:37.272Z"
parent: S-079
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-140")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```