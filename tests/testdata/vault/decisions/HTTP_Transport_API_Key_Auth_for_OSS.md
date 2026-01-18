---
id: DEC-078
type: decision
title: "HTTP Transport: API Key Auth for OSS"
workstream: engineering
status: Pending
created_at: "2026-01-15T02:33:00.308Z"
updated_at: "2026-01-15T02:34:04.701Z"
---

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-078") OR contains(file.frontmatter.enabled_by, "DEC-078")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```