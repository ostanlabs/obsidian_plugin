---
id: S-084
type: story
title: HTTP Transport TLS Support
workstream: engineering
status: Not Started
created_at: 2026-01-15T03:11:18.552Z
updated_at: 2026-01-15T04:22:07.888Z
effort: Engineering
priority: Medium
parent: M-040
children: ["T-170"]
depends_on: []
updated: 2026-01-17T00:06:28.180Z
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
WHERE contains(enables, "S-084")
SORT decided_at DESC
```