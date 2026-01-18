---
id: DEC-068
type: decision
title: Homelab Deployment Strategy
workstream: infra
status: Decided
created_at: "2026-01-14T18:41:15.111Z"
updated_at: "2026-01-14T22:18:11.794Z"
blocks: ["DEC-069","S-079"]
updated: 2026-01-17T07:30:24.766Z
---

## Context

AEL needs to be deployed to the homelab along with its dependencies (Firecrawl, Kafka). This decision covers the overall deployment strategy - how services are packaged and deployed.

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-068") OR contains(file.frontmatter.enabled_by, "DEC-068")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```