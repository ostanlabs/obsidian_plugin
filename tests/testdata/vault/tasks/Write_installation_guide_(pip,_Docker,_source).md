---
id: T-227
type: task
title: "Write installation guide (pip, Docker, source)"
workstream: engineering
created_at: "2026-01-15T13:03:13.620Z"
updated_at: "2026-01-15T13:03:13.620Z"
parent: S-095
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-227")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```