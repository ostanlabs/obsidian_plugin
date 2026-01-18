---
id: S-063
type: story
title: Multi-Tenancy Support
workstream: engineering
status: Not Started
created_at: "2026-01-13T22:22:06.585Z"
updated_at: "2026-01-14T14:27:25.741Z"
effort: Engineering
priority: Medium
parent: M-040
implements: [F-034]
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
WHERE contains(enables, "S-063")
SORT decided_at DESC
```