---
id: T-049
type: task
title: Create extract-top-stories.yaml workflow
workstream: business
created_at: "2026-01-13T11:19:37.682Z"
updated_at: "2026-01-13T11:19:37.682Z"
parent: S-046
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-049")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```