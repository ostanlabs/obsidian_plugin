---
id: T-182
type: task
title: Implement RequestContext dataclass
workstream: engineering
created_at: "2026-01-15T04:53:48.803Z"
updated_at: "2026-01-15T04:53:48.803Z"
parent: S-085
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-182")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```