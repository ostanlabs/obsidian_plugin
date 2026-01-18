---
id: T-062
type: task
title: Create enterprise pitch deck
workstream: business
created_at: "2026-01-13T11:19:49.179Z"
updated_at: "2026-01-13T11:19:49.179Z"
parent: S-050
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-062")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```