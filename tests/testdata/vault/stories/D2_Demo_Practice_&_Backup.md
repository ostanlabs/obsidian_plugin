---
id: S-049
type: story
title: "D2: Demo Practice & Backup"
workstream: business
status: Not Started
created_at: "2026-01-13T11:19:25.131Z"
updated_at: "2026-01-13T11:19:43.393Z"
effort: Engineering
priority: Medium
parent: M-032
children: ["T-058"]
updated: 2026-01-13T11:27:17.459Z
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
WHERE contains(enables, "S-049")
SORT decided_at DESC
```