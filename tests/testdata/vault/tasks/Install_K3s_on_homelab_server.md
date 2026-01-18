---
id: T-156
type: task
title: Install K3s on homelab server
workstream: infra
created_at: "2026-01-14T22:18:57.615Z"
updated_at: "2026-01-14T22:18:57.615Z"
parent: S-083
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-156")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```