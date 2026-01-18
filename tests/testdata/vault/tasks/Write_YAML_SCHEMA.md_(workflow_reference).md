---
id: T-102
type: task
title: Write YAML_SCHEMA.md (workflow reference)
workstream: engineering
status: Not Started
created_at: "2026-01-13T13:06:08.505Z"
updated_at: "2026-01-15T03:16:50.193Z"
parent: S-057
goal: 
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-102")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```