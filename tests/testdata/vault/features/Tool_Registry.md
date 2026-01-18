---
id: F-006
type: feature
title: Tool Registry
workstream: engineering
status: Complete
created_at: "2026-01-14T00:54:30.359Z"
updated_at: "2026-01-14T18:21:28.380Z"
user_story: []
tier: OSS
phase: MVP
implemented_by: [M-007]
---

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "F-006")
SORT type ASC, title ASC
```

## 📄 Documentation

```dataview
TABLE title as "Document", doc_type as "Type", status as "Status"
FROM "documents"
WHERE contains(documents, "F-006")
SORT title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_on as "Date"
FROM "decisions"
WHERE contains(affects, "F-006")
SORT decided_on DESC
```