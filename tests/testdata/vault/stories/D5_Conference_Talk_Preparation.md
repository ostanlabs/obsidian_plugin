---
id: S-052
type: story
title: "D5: Conference Talk Preparation"
workstream: business
status: Not Started
created_at: "2026-01-13T11:19:25.170Z"
updated_at: "2026-01-13T11:20:00.691Z"
effort: Engineering
priority: Medium
parent: M-035
children: ["T-075","T-076","T-077","T-078","T-079"]
updated: 2026-01-13T11:27:17.484Z
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
WHERE contains(enables, "S-052")
SORT decided_at DESC
```