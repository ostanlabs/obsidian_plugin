---
id: T-032
type: task
title: Create internal/README.md documentation
workstream: engineering
status: Completed
created_at: "2026-01-12T03:03:34.849Z"
updated_at: "2026-01-12T04:40:22.107Z"
parent: S-004
goal: "Document setup, usage, running AEL, testing workflows, Claude Desktop integration, and troubleshooting"
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-032")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```