---
id: M-038
type: milestone
title: "D8: Security Demo"
workstream: business
status: Not Started
created_at: "2026-01-13T04:41:15.178Z"
updated_at: "2026-01-13T11:27:10.134Z"
priority: Medium
depends_on: ["M-033"]
implements: [DOC-053]
updated: 2026-01-16T20:48:42.560Z
children: ["S-055"]
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
WHERE contains(enables, "M-038")
SORT decided_at DESC
```