---
id: S-010
type: story
title: "PR-02: Define Target Audience & Positioning"
workstream: business
status: Not Started
created_at: "2025-12-18T22:17:49.666Z"
updated_at: "2025-12-23T04:35:44.058Z"
effort: Marketing
priority: High
parent: M-020
depends_on: ["S-003"]
updated: 2026-01-16T20:48:42.555Z
blocks: ["S-013"]
---

## Outcome

Clear understanding of who we're talking to and how we want to be perceived

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
WHERE contains(enables, "S-010")
SORT decided_at DESC
```