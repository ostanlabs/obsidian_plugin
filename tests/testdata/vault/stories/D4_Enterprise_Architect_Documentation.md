---
id: S-051
type: story
title: "D4: Enterprise Architect Documentation"
workstream: business
status: Not Started
created_at: "2026-01-13T11:19:25.156Z"
updated_at: "2026-01-13T11:19:55.538Z"
effort: Engineering
priority: Medium
parent: M-034
children: ["T-067","T-068","T-069","T-071","T-072","T-073","T-074"]
updated: 2026-01-13T11:27:17.476Z
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
WHERE contains(enables, "S-051")
SORT decided_at DESC
```