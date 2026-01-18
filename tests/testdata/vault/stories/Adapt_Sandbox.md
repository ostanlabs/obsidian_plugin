---
id: S-037
type: story
title: "M-06: Adapt Sandbox"
workstream: engineering
status: Completed
created_at: "2025-12-18T22:18:55.783Z"
updated_at: "2025-12-23T01:16:56.721Z"
effort: Engineering
priority: High
parent: M-010
depends_on: []
implements: ["DOC-029"]
updated: 2026-01-16T20:48:42.577Z
---

## Outcome

src/ael/sandbox/sandbox.py adapted for AEL

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
WHERE contains(enables, "S-037")
SORT decided_at DESC
```