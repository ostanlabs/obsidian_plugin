---
id: M-008
type: milestone
title: "Component 6: Template Engine"
workstream: engineering
status: Completed
created_at: "2025-12-18T22:20:03.346Z"
updated_at: "2026-01-14T01:02:53.645Z"
priority: Critical
depends_on: ["[M-005]","M-005"]
implements: [DOC-025, F-005]
updated: 2026-01-14T04:33:28.617Z
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
WHERE contains(enables, "M-008")
SORT decided_at DESC
```