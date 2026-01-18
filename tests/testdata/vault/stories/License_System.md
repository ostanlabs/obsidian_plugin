---
id: S-065
type: story
title: License System
workstream: engineering
created_at: "2026-01-13T22:22:06.627Z"
updated_at: "2026-01-13T22:22:06.627Z"
parent: M-040
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
WHERE contains(enables, "S-065")
SORT decided_at DESC
```