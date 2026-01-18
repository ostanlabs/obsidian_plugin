---
id: T-265
type: task
title: Configure custom domain (optional)
workstream: engineering
created_at: "2026-01-17T15:58:57.722Z"
updated_at: "2026-01-17T15:58:57.722Z"
parent: S-101
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-265")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```