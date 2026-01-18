---
id: S-097
type: story
title: Workflow Authoring Guide
workstream: engineering
status: Not Started
created_at: "2026-01-15T13:03:07.408Z"
updated_at: "2026-01-15T13:03:21.532Z"
effort: Engineering
priority: Medium
parent: M-028
children: ["T-235","T-236","T-237","T-238","T-239"]
updated: 2026-01-15T23:49:04.124Z
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
WHERE contains(enables, "S-097")
SORT decided_at DESC
```