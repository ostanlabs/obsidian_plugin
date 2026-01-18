---
id: T-025
type: task
title: Create fetch-url.yaml workflow
workstream: engineering
status: Completed
created_at: "2026-01-12T03:03:34.777Z"
updated_at: "2026-01-12T04:39:46.019Z"
parent: S-004
goal: Simple workflow using http_request tool to fetch a URL and return response
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-025")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```