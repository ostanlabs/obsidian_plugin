---
id: T-183
type: task
title: Implement StepContext dataclass
workstream: engineering
created_at: "2026-01-15T04:53:48.830Z"
updated_at: "2026-01-15T04:53:48.830Z"
parent: S-085
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-183")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```