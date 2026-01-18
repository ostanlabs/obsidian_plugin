---
id: T-026
type: task
title: Create fetch-and-publish.yaml workflow
workstream: engineering
status: Completed
created_at: "2026-01-12T03:03:34.787Z"
updated_at: "2026-01-12T04:39:54.005Z"
parent: S-004
goal: "Multi-step workflow: http_request → code transform → kafka_publish"
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-026")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```