---
id: M-002
type: milestone
title: "Component 0: Shared Types"
workstream: engineering
status: Completed
created_at: "2025-12-18T22:19:18.163Z"
updated_at: "2026-01-14T01:02:53.688Z"
priority: Critical
implements: ["[DOC-028, F-020]","DOC-028","F-020"]
updated: 2026-01-17T18:28:11.740Z
blocks: ["M-003"]
children: ["S-042"]
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
WHERE contains(enables, "M-002")
SORT decided_at DESC
```