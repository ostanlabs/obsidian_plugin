---
id: DOC-054
type: document
title: Feature Registry
workstream: product
status: Draft
cssclasses: [canvas-document, canvas-effort-product, canvas-status-draft]
created_at: "2026-01-13T22:21:31.572Z"
updated_at: "2026-01-13T22:21:31.572Z"
doc_type: spec
previous_version: []
---

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-054")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-054")
SORT decided_at DESC
```