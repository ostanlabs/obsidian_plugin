---
id: DEC-067
type: decision
title: Observability Visualization Stack
workstream: engineering
status: Decided
created_at: "2026-01-14T18:41:15.064Z"
updated_at: "2026-01-14T22:18:11.793Z"
blocks: ["S-076"]
updated: 2026-01-17T16:02:43.372Z
---

## Context

We need a visualization and dashboarding solution for AEL metrics, logs, and traces. This will be used for monitoring AEL in the homelab and potentially offered to enterprise users.

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-067") OR contains(file.frontmatter.enabled_by, "DEC-067")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```