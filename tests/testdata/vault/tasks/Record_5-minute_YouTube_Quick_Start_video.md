---
id: T-054
type: task
title: Record 5-minute YouTube Quick Start video
workstream: business
created_at: "2026-01-13T11:19:37.770Z"
updated_at: "2026-01-13T11:19:37.770Z"
parent: S-047
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-054")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```