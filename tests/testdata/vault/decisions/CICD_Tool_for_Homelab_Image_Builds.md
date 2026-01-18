---
id: DEC-081
type: decision
title: CI/CD Tool for Homelab Image Builds
workstream: infra
status: Pending
created_at: "2026-01-16T05:49:34.775Z"
updated_at: "2026-01-16T05:52:43.771Z"
blocks: ["S-100"]
updated: 2026-01-16T20:46:31.563Z
---

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-081") OR contains(file.frontmatter.enabled_by, "DEC-081")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```