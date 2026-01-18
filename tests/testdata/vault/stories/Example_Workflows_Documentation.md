---
id: S-098
type: story
title: Example Workflows Documentation
workstream: engineering
status: Not Started
created_at: "2026-01-15T13:03:07.442Z"
updated_at: "2026-01-15T13:03:21.663Z"
effort: Engineering
priority: Medium
parent: M-028
children: ["T-240","T-241","T-242","T-243"]
updated: 2026-01-15T23:49:04.127Z
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
WHERE contains(enables, "S-098")
SORT decided_at DESC
```