---
id: S-081
type: story
title: "Phase 2: Add Tempo for Distributed Tracing"
workstream: engineering
status: Completed
created_at: "2026-01-14T22:18:36.766Z"
updated_at: "2026-01-15T12:54:09.316Z"
effort: Engineering
priority: Medium
parent: M-025
depends_on: ["S-076","S-082"]
updated: 2026-01-16T20:48:42.462Z
children: ["T-147","T-148","T-149","T-150"]
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
WHERE contains(enables, "S-081")
SORT decided_at DESC
```