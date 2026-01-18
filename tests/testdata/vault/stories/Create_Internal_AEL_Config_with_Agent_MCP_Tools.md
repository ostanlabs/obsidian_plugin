---
id: S-004
type: story
title: Create Internal AEL Config with Agent MCP Tools
workstream: engineering
status: Completed
created_at: "2025-12-18T22:17:37.549Z"
updated_at: "2026-01-12T13:31:26.503Z"
effort: Engineering
priority: High
parent: M-030
implements: ["DOC-034"]
updated: 2026-01-16T20:48:42.469Z
children: ["T-024","T-025","T-026","T-027","T-028","T-029","T-030","T-031","T-032","T-033"]
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
WHERE contains(enables, "S-004")
SORT decided_at DESC
```