---
id: M-035
type: milestone
title: "D5: Conference Demo"
workstream: business
status: Not Started
created_at: "2026-01-13T04:41:15.139Z"
updated_at: "2026-01-13T11:26:58.012Z"
priority: Medium
depends_on: ["M-032"]
blocks: [M-036]
implements: [DOC-050]
updated: 2026-01-16T20:48:42.562Z
children: ["S-052"]
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
WHERE contains(enables, "M-035")
SORT decided_at DESC
```