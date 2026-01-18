---
id: T-048
type: task
title: Create Docker demo environment
workstream: business
created_at: "2026-01-13T11:19:37.666Z"
updated_at: "2026-01-13T11:19:37.666Z"
parent: S-046
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-048")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```