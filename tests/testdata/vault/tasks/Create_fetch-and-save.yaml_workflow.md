---
id: T-084
type: task
title: Create fetch-and-save.yaml workflow
workstream: business
created_at: "2026-01-13T11:20:13.192Z"
updated_at: "2026-01-13T11:20:13.192Z"
parent: S-054
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-084")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```