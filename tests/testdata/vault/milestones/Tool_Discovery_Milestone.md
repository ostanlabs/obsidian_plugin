---
id: M-015
type: milestone
title: "M1: Tool Discovery Milestone"
workstream: engineering
status: Completed
created_at: "2025-12-18T22:21:26.046Z"
updated_at: "2025-12-23T23:26:38.076Z"
priority: High
depends_on: ["M-014"]
updated: 2026-01-16T20:48:42.586Z
blocks: ["M-016"]
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
WHERE contains(enables, "M-015")
SORT decided_at DESC
```