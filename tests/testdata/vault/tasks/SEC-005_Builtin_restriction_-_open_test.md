---
id: T-218
type: task
title: "SEC-005: Builtin restriction - open test"
workstream: engineering
created_at: "2026-01-15T13:02:06.361Z"
updated_at: "2026-01-15T13:02:06.361Z"
parent: S-092
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-218")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```