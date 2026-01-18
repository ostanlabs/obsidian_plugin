---
id: S-092
type: story
title: Security Integration Tests
workstream: engineering
status: Not Started
created_at: "2026-01-15T13:01:48.585Z"
updated_at: "2026-01-15T13:02:06.392Z"
effort: Engineering
priority: Medium
parent: M-026
children: ["T-214","T-215","T-216","T-217","T-218","T-219"]
updated: 2026-01-15T23:49:04.109Z
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
WHERE contains(enables, "S-092")
SORT decided_at DESC
```