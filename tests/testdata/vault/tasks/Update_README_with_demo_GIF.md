---
id: T-052
type: task
title: Update README with demo GIF
workstream: business
created_at: "2026-01-13T11:19:37.720Z"
updated_at: "2026-01-13T11:19:37.720Z"
parent: S-047
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-052")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```