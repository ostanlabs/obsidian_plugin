---
id: S-088
type: story
title: Workflow Engine Integration
workstream: engineering
status: Not Started
created_at: "2026-01-15T04:53:41.719Z"
updated_at: "2026-01-15T04:54:09.208Z"
effort: Engineering
priority: Medium
parent: M-024
children: ["T-197","T-198","T-199","T-200"]
updated: 2026-01-15T23:49:04.073Z
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
WHERE contains(enables, "S-088")
SORT decided_at DESC
```