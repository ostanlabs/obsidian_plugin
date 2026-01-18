---
id: S-050
type: story
title: "D3: Enterprise Leader Demo Materials"
workstream: business
status: Not Started
created_at: "2026-01-13T11:19:25.143Z"
updated_at: "2026-01-13T11:19:49.243Z"
effort: Engineering
priority: Medium
parent: M-033
children: ["T-060","T-061","T-062","T-063","T-064","T-065","T-066"]
updated: 2026-01-13T11:27:17.467Z
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
WHERE contains(enables, "S-050")
SORT decided_at DESC
```