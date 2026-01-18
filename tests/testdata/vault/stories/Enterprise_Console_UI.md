---
id: S-070
type: story
title: Enterprise Console UI
workstream: engineering
status: Not Started
created_at: "2026-01-13T22:22:06.733Z"
updated_at: "2026-01-14T14:34:57.588Z"
effort: Engineering
priority: Medium
parent: M-041
implements: ["F-041","F-038","F-037","F-039","F-040"]
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
WHERE contains(enables, "S-070")
SORT decided_at DESC
```