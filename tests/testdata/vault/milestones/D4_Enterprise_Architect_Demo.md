---
id: M-034
type: milestone
title: "D4: Enterprise Architect Demo"
workstream: business
status: Not Started
created_at: "2026-01-13T04:41:15.129Z"
updated_at: "2026-01-13T11:26:53.417Z"
priority: Medium
depends_on: ["M-033"]
implements: [DOC-049]
updated: 2026-01-16T20:48:42.563Z
children: ["S-051"]
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
WHERE contains(enables, "M-034")
SORT decided_at DESC
```