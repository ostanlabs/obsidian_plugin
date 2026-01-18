---
id: S-068
type: story
title: Tool Selection Engine
workstream: engineering
status: Not Started
created_at: "2026-01-13T22:22:06.690Z"
updated_at: "2026-01-14T14:31:06.249Z"
effort: Engineering
priority: Medium
parent: M-041
implements: [F-032]
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
WHERE contains(enables, "S-068")
SORT decided_at DESC
```