---
id: DEC-069
type: decision
title: Container Orchestration for Homelab
workstream: infra
status: Pending
created_at: "2026-01-14T18:41:15.151Z"
updated_at: "2026-01-14T22:19:06.519Z"
depends_on: ["DEC-068"]
blocks: ["S-083"]
updated: 2026-01-16T20:56:23.913Z
---

## Context

If we choose container orchestration beyond simple Docker Compose, we need to decide which platform. This affects the M-001 'Lab infrastructure is ready' milestone.

## Decision

Deferred until K8s migration is planned. Current recommendation is K3s (Option A) when the time comes due to its lightweight nature and production compatibility.

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-069") OR contains(file.frontmatter.enabled_by, "DEC-069")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```