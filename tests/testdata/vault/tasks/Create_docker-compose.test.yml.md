---
id: T-206
type: task
title: Create docker-compose.test.yml
workstream: engineering
created_at: "2026-01-15T13:01:53.337Z"
updated_at: "2026-01-15T13:01:53.337Z"
parent: S-090
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-206")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```