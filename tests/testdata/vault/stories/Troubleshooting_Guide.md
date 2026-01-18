---
id: S-099
type: story
title: Troubleshooting Guide
workstream: engineering
status: Not Started
created_at: "2026-01-15T13:03:07.476Z"
updated_at: "2026-01-15T13:03:21.755Z"
effort: Engineering
priority: Medium
parent: M-028
children: ["T-244","T-245","T-246"]
updated: 2026-01-15T23:49:04.130Z
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
WHERE contains(enables, "S-099")
SORT decided_at DESC
```