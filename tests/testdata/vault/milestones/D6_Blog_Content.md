---
id: M-036
type: milestone
title: "D6: Blog Content"
workstream: business
status: Not Started
created_at: "2026-01-13T04:41:15.150Z"
updated_at: "2026-01-13T11:26:58.011Z"
priority: Medium
depends_on: [M-035]
implements: [DOC-051]
updated: 2026-01-13T11:27:17.352Z
children: ["S-053"]
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
WHERE contains(enables, "M-036")
SORT decided_at DESC
```