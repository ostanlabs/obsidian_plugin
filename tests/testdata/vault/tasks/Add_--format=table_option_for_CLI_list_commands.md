---
id: T-047
type: task
title: Add --format=table option for CLI list commands
workstream: engineering
status: Not Started
created_at: "2026-01-13T03:25:37.934Z"
updated_at: "2026-01-13T03:25:42.602Z"
parent: S-045
goal: "Add `--format` option to CLI list commands (`ael tools list`, `ael workflows list`) with values: `simple` (default) and `table`. Table format should use proper column alignment for better readability."
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-047")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```