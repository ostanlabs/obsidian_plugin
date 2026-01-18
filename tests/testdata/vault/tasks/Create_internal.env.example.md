---
id: T-033
type: task
title: Create internal/.env.example
workstream: engineering
status: Completed
created_at: "2026-01-12T03:13:01.210Z"
updated_at: "2026-01-12T04:39:36.833Z"
parent: S-004
goal: "Document required environment variables for Firecrawl, Kafka, Ollama, and workspace"
---

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "T-033")
SORT decided_at DESC
```

### Blocking Decisions

```dataview
TABLE title as "Decision", status as "Status"
FROM "decisions"
WHERE contains(this.depends_on, id)
SORT title ASC
```