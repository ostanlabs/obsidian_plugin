---
id: S-096
type: story
title: CLI Reference Documentation
workstream: engineering
status: Not Started
created_at: "2026-01-15T13:03:07.375Z"
updated_at: "2026-01-15T13:03:13.852Z"
effort: Engineering
priority: Medium
parent: M-028
children: ["T-231","T-232","T-233","T-234"]
updated: 2026-01-15T23:49:04.122Z
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
WHERE contains(enables, "S-096")
SORT decided_at DESC
```