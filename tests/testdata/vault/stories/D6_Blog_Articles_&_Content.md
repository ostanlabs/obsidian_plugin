---
id: S-053
type: story
title: "D6: Blog Articles & Content"
workstream: business
status: Not Started
created_at: "2026-01-13T11:19:25.183Z"
updated_at: "2026-01-13T11:20:05.974Z"
effort: Engineering
priority: Medium
parent: M-036
children: ["T-080","T-081","T-082","T-083"]
updated: 2026-01-13T11:27:17.492Z
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
WHERE contains(enables, "S-053")
SORT decided_at DESC
```