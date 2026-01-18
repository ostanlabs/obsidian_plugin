---
id: S-085
type: story
title: Core Plugin Types
workstream: engineering
status: Not Started
created_at: "2026-01-15T04:53:41.625Z"
updated_at: "2026-01-15T04:53:48.881Z"
effort: Engineering
priority: Medium
parent: M-024
children: ["T-180","T-181","T-182","T-183","T-184","T-185"]
updated: 2026-01-15T23:49:04.060Z
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
WHERE contains(enables, "S-085")
SORT decided_at DESC
```