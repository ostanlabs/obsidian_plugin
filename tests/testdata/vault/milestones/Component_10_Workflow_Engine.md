---
id: M-012
type: milestone
title: "Component 10: Workflow Engine"
workstream: engineering
status: Completed
created_at: "2025-12-18T22:20:44.809Z"
updated_at: "2026-01-16T20:12:02.527Z"
priority: Critical
depends_on: ["[M-009, M-008, M-011]","M-011","M-008"]
blocks: ["M-018"]
implements: ["DOC-019","DOC-009","F-002"]
updated: 2026-01-17T18:14:41.342Z
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
WHERE contains(enables, "M-012")
SORT decided_at DESC
```