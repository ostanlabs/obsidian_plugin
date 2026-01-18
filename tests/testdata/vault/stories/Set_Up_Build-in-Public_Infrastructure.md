---
id: S-017
type: story
title: "PR-05: Set Up Build-in-Public Infrastructure"
workstream: business
status: Not Started
created_at: "2025-12-18T22:18:14.818Z"
updated_at: "2025-12-23T04:36:07.528Z"
effort: Marketing
priority: Medium
parent: M-021
depends_on: ["S-015"]
updated: 2026-01-16T20:48:42.528Z
blocks: ["S-019"]
---

## Outcome

Systems in place to document and share the journey

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
WHERE contains(enables, "S-017")
SORT decided_at DESC
```