---
id: S-045
type: story
title: CLI Output Enhancements
workstream: engineering
status: Not Started
created_at: "2026-01-13T03:25:37.923Z"
updated_at: "2026-01-13T03:26:20.007Z"
effort: Engineering
priority: Medium
parent: M-028
updated: 2026-01-13T11:27:17.402Z
children: ["T-047"]
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
WHERE contains(enables, "S-045")
SORT decided_at DESC
```