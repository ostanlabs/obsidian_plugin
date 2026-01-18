---
id: T-164
type: task
title: "Add opentelemetry-* packages to pyproject.toml"
workstream: engineering
status: Completed
created_at: "2026-01-14T22:22:22.799Z"
updated_at: "2026-01-15T04:11:42.419Z"
parent: S-072
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-164")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```