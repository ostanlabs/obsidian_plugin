---
id: S-047
type: story
title: "D1: Content Creation (GIF, Docs, Video)"
workstream: business
status: Not Started
created_at: "2026-01-13T11:19:25.103Z"
updated_at: "2026-01-13T11:19:37.771Z"
effort: Engineering
priority: Medium
parent: M-031
children: ["T-051","T-052","T-053","T-054"]
updated: 2026-01-13T11:27:17.442Z
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
WHERE contains(enables, "S-047")
SORT decided_at DESC
```