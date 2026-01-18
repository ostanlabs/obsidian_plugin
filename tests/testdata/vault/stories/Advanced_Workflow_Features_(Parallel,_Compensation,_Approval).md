---
id: S-064
type: story
title: "Advanced Workflow Features (Parallel, Compensation, Approval)"
workstream: engineering
status: Not Started
created_at: "2026-01-13T22:22:06.606Z"
updated_at: "2026-01-14T14:26:46.926Z"
effort: Engineering
priority: Medium
parent: M-040
implements: ["F-029","F-025","F-027","F-026","F-028"]
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
WHERE contains(enables, "S-064")
SORT decided_at DESC
```