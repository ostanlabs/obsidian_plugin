---
id: T-240
type: task
title: Create web scraping workflow example
workstream: engineering
created_at: "2026-01-15T13:03:21.569Z"
updated_at: "2026-01-15T13:03:21.569Z"
parent: S-098
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-240")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```