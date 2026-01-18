---
id: T-147
type: task
title: Deploy Tempo to homelab
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:46.512Z"
updated_at: "2026-01-15T12:53:33.081Z"
parent: S-081
goal: []
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-147")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```