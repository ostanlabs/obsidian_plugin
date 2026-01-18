---
id: DEC-071
type: decision
title: Docker Base Image Selection
workstream: engineering
status: Decided
created_at: "2026-01-15T00:39:34.106Z"
updated_at: "2026-01-15T00:40:07.255Z"
---

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-071") OR contains(file.frontmatter.enabled_by, "DEC-071")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```