---
id: T-181
type: task
title: Implement HookResult generic dataclass
workstream: engineering
created_at: "2026-01-15T04:53:48.776Z"
updated_at: "2026-01-15T04:53:48.776Z"
parent: S-085
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-181")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```