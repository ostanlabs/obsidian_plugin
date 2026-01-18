---
id: T-060
type: task
title: Create file-processor.yaml workflow
workstream: business
created_at: "2026-01-13T11:19:49.142Z"
updated_at: "2026-01-13T11:19:49.142Z"
parent: S-050
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-060")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```