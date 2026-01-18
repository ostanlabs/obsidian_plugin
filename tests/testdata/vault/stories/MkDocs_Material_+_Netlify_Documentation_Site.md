---
id: S-101
type: story
title: MkDocs Material + Netlify Documentation Site
workstream: engineering
status: Not Started
created_at: "2026-01-17T15:58:39.303Z"
updated_at: "2026-01-17T15:59:19.826Z"
effort: Engineering
priority: Medium
parent: M-042
children: ["T-263","T-264","T-259","T-256","T-261","T-257","T-262","T-260","T-265","T-258"]
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
WHERE contains(enables, "S-101")
SORT decided_at DESC
```