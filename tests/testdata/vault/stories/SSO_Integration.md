---
id: S-061
type: story
title: SSO Integration
workstream: engineering
status: Not Started
created_at: "2026-01-13T22:22:06.517Z"
updated_at: "2026-01-14T14:24:19.287Z"
effort: Engineering
priority: Medium
parent: M-040
implements: [F-023]
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
WHERE contains(enables, "S-061")
SORT decided_at DESC
```