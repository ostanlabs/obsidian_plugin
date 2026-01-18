---
id: S-089
type: story
title: "Built-in Plugins (Logging, Metrics)"
workstream: engineering
status: Not Started
created_at: "2026-01-15T04:53:41.749Z"
updated_at: "2026-01-15T04:54:09.302Z"
effort: Engineering
priority: Medium
parent: M-024
children: ["T-201","T-202","T-203"]
updated: 2026-01-15T23:49:04.076Z
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
WHERE contains(enables, "S-089")
SORT decided_at DESC
```