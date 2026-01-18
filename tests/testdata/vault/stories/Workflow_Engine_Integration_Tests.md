---
id: S-091
type: story
title: Workflow Engine Integration Tests
workstream: engineering
status: Not Started
created_at: "2026-01-15T13:01:48.551Z"
updated_at: "2026-01-15T13:02:00.803Z"
effort: Engineering
priority: Medium
parent: M-026
children: ["T-209","T-210","T-211","T-212","T-213"]
updated: 2026-01-15T23:49:04.106Z
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
WHERE contains(enables, "S-091")
SORT decided_at DESC
```