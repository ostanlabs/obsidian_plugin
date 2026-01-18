---
id: T-220
type: task
title: "FE-001: tools/list returns workflows test"
workstream: engineering
created_at: "2026-01-15T13:02:13.547Z"
updated_at: "2026-01-15T13:02:13.547Z"
parent: S-093
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-220")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```