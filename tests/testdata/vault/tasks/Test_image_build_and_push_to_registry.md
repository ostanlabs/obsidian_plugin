---
id: T-252
type: task
title: Test image build and push to registry
workstream: infra
created_at: "2026-01-16T05:49:55.345Z"
updated_at: "2026-01-16T05:49:55.345Z"
parent: S-100
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-252")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```