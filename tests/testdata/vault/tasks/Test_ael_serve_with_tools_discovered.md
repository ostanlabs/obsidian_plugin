---
id: T-029
type: task
title: Test ael serve with tools discovered
workstream: engineering
status: Completed
created_at: "2026-01-12T03:03:34.816Z"
updated_at: "2026-01-12T04:49:55.975Z"
parent: S-004
goal: Verify AEL starts with 'ael serve -c internal/ael-config.yaml' and discovers native_tools
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-029")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```