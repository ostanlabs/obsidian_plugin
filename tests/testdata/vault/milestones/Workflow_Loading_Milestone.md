---
id: M-016
type: milestone
title: "M2: Workflow Loading Milestone"
workstream: engineering
status: Completed
created_at: "2025-12-18T22:21:31.425Z"
updated_at: "2025-12-23T23:26:45.055Z"
priority: High
depends_on: ["M-009","M-015"]
updated: 2026-01-16T20:48:42.583Z
blocks: ["M-017"]
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
WHERE contains(enables, "M-016")
SORT decided_at DESC
```