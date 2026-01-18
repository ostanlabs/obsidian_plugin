---
id: T-087
type: task
title: Write MCP ecosystem blog post
workstream: business
created_at: "2026-01-13T11:20:13.243Z"
updated_at: "2026-01-13T11:20:13.243Z"
parent: S-054
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-087")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```