---
id: S-072
type: story
title: Basic Metrics Implementation
workstream: engineering
status: Completed
created_at: "2026-01-14T01:06:07.792Z"
updated_at: "2026-01-15T12:54:09.320Z"
effort: Engineering
priority: Medium
parent: 
depends_on: ["DEC-066"]
blocks: ["S-076","S-082"]
implements: ["F-015"]
updated: 2026-01-17T18:28:11.795Z
children: ["T-110","T-111","T-113","T-114","T-115","T-164","T-112"]
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
WHERE contains(enables, "S-072")
SORT decided_at DESC
```