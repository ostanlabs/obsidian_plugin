---
id: DEC-063
type: decision
title: Plugin Sync vs Async Support
workstream: engineering
status: Decided
archived: false
created_at: "2025-12-22T07:05:39.353Z"
updated_at: "2025-12-23T05:49:10.776Z"
decided_by: Architecture Team
decided_on: "2025-12-22T07:05:39.353Z"
enables: ["DOC-031"]
updated: 2026-01-17T18:28:11.817Z
---

## Context

Should plugin hooks be synchronous, asynchronous, or both?

## Decision

Option D (OSS sync only, Premium adds async support). Sync for OSS, async option for Premium.

## Rationale

OSS plugins (logging, metrics, transforms) rarely need async. Premium plugins (policy checks, approval workflows) often call external services. Keeps OSS simple and approachable. Async complexity only for users who need it (and pay for it).

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-063") OR contains(file.frontmatter.enabled_by, "DEC-063")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```
