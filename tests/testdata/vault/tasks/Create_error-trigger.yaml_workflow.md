---
id: T-061
type: task
title: Create error-trigger.yaml workflow
workstream: business
created_at: "2026-01-13T11:19:49.164Z"
updated_at: "2026-01-13T11:19:49.164Z"
parent: S-050
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-061")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```