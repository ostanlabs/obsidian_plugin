---
id: T-080
type: task
title: "Write article: Building Your First AEL Workflow"
workstream: business
created_at: "2026-01-13T11:20:05.922Z"
updated_at: "2026-01-13T11:20:05.922Z"
parent: S-053
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-080")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```