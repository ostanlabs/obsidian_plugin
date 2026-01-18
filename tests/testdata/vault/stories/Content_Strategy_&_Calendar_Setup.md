---
id: S-015
type: story
title: "PR-04: Content Strategy & Calendar Setup"
workstream: business
status: Not Started
created_at: "2025-12-18T22:18:06.614Z"
updated_at: "2025-12-23T04:36:04.412Z"
effort: Marketing
priority: High
parent: M-021
depends_on: ["S-013"]
updated: 2026-01-16T20:48:42.529Z
blocks: ["S-017"]
---

## Outcome

Repeatable system for consistent content creation

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
WHERE contains(enables, "S-015")
SORT decided_at DESC
```