---
id: M-014
type: milestone
title: "Component 12: CLI"
workstream: engineering
status: Completed
created_at: "2025-12-18T22:21:01.748Z"
updated_at: "2026-01-14T14:20:27.979Z"
priority: High
depends_on: ["[M-012, M-013]","M-013"]
implements: ["[DOC-018, F-010]","F-010"]
updated: 2026-01-17T18:14:41.345Z
blocks: ["M-015","M-019"]
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
WHERE contains(enables, "M-014")
SORT decided_at DESC
```