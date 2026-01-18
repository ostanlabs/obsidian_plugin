---
id: S-095
type: story
title: Getting Started Documentation
workstream: engineering
status: Not Started
created_at: "2026-01-15T13:03:07.337Z"
updated_at: "2026-01-15T13:03:13.722Z"
effort: Engineering
priority: Medium
parent: M-028
children: ["T-227","T-228","T-229","T-230"]
updated: 2026-01-15T23:49:04.118Z
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
WHERE contains(enables, "S-095")
SORT decided_at DESC
```