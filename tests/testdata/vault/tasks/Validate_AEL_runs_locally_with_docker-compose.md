---
id: T-254
type: task
title: Validate AEL runs locally with docker-compose
workstream: infra
status: Not Started
created_at: "2026-01-16T07:21:32.683Z"
updated_at: "2026-01-16T07:21:54.774Z"
parent: S-078
goal: 
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-254")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```