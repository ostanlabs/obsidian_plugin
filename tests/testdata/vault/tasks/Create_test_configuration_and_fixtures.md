---
id: T-204
type: task
title: Create test configuration and fixtures
workstream: engineering
created_at: "2026-01-15T13:01:53.256Z"
updated_at: "2026-01-15T13:01:53.256Z"
parent: S-090
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-204")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```