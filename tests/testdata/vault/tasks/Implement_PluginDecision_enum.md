---
id: T-180
type: task
title: Implement PluginDecision enum
workstream: engineering
created_at: "2026-01-15T04:53:48.746Z"
updated_at: "2026-01-15T04:53:48.746Z"
parent: S-085
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-180")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```