---
id: T-086
type: task
title: Record and edit MCP ecosystem video
workstream: business
created_at: "2026-01-13T11:20:13.227Z"
updated_at: "2026-01-13T11:20:13.227Z"
parent: S-054
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-086")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```