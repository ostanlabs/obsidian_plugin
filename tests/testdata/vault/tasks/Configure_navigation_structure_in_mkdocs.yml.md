---
id: T-260
type: task
title: Configure navigation structure in mkdocs.yml
workstream: engineering
created_at: "2026-01-17T15:58:57.518Z"
updated_at: "2026-01-17T15:58:57.518Z"
parent: S-101
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-260")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```