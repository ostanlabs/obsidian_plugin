---
id: S-048
type: story
title: "D2: Pitch Materials & Visuals"
workstream: business
status: Not Started
created_at: "2026-01-13T11:19:25.116Z"
updated_at: "2026-01-13T11:19:43.368Z"
effort: Engineering
priority: Medium
parent: M-032
children: ["T-055","T-056","T-057"]
updated: 2026-01-13T11:27:17.445Z
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
WHERE contains(enables, "S-048")
SORT decided_at DESC
```