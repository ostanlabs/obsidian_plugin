---
id: S-087
type: story
title: Hook Execution Chain
workstream: engineering
status: Not Started
created_at: "2026-01-15T04:53:41.690Z"
updated_at: "2026-01-15T04:54:02.613Z"
effort: Engineering
priority: Medium
parent: M-024
children: ["T-192","T-193","T-194","T-195","T-196"]
updated: 2026-01-15T23:49:04.068Z
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
WHERE contains(enables, "S-087")
SORT decided_at DESC
```