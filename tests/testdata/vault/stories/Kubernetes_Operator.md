---
id: S-075
type: story
title: Kubernetes Operator
workstream: engineering
status: Not Started
created_at: "2026-01-14T01:06:07.899Z"
updated_at: "2026-01-14T14:28:19.490Z"
effort: Engineering
priority: Medium
parent: M-040
implements: [F-036]
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
WHERE contains(enables, "S-075")
SORT decided_at DESC
```