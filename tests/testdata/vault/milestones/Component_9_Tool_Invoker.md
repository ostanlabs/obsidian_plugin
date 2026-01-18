---
id: M-011
type: milestone
title: "Component 9: Tool Invoker"
workstream: engineering
status: Completed
created_at: "2025-12-18T22:20:36.210Z"
updated_at: "2026-01-14T01:02:53.637Z"
priority: Critical
depends_on: ["[M-007, M-010]","M-010","M-007"]
implements: [DOC-026, F-003]
updated: 2026-01-16T22:24:23.996Z
blocks: ["M-012"]
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
WHERE contains(enables, "M-011")
SORT decided_at DESC
```