---
id: S-041
type: story
title: "MVP Polish: Deferred CLI Commands"
workstream: engineering
status: Completed
created_at: "2025-12-20T16:35:31.501Z"
updated_at: "2026-01-13T10:14:56.503Z"
effort: Engineering
priority: Critical
parent: M-029
children: ["T-018","T-019","T-020","T-021","T-022","T-023"]
implements: ["DOC-018","DOC-043"]
updated: 2026-01-16T20:48:42.483Z
---

## 📄 Documents

```dataview
TABLE title as "Document", document_type as "Type", version as "Version"
FROM "documents"
WHERE contains(this.implements, id)
SORT title ASC
```

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "S-041")
SORT decided_at DESC
```