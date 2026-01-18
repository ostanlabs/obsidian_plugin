---
id: T-058
type: task
title: Practice investor demo (10 iterations)
workstream: business
created_at: "2026-01-13T11:19:43.379Z"
updated_at: "2026-01-13T11:19:43.379Z"
parent: S-049
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-058")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```