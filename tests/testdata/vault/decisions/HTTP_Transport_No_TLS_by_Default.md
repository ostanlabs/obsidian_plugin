---
id: DEC-079
type: decision
title: "HTTP Transport: No TLS by Default"
workstream: engineering
status: Pending
created_at: "2026-01-15T02:33:00.340Z"
updated_at: "2026-01-15T02:34:04.702Z"
---

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-079") OR contains(file.frontmatter.enabled_by, "DEC-079")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```