---
id: T-078
type: task
title: Write blog post version of talk
workstream: business
created_at: "2026-01-13T11:20:00.674Z"
updated_at: "2026-01-13T11:20:00.674Z"
parent: S-052
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-078")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```