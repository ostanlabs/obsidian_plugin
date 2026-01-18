---
id: DEC-064
type: decision
title: Plugin Execution Order
workstream: engineering
status: Decided
archived: false
created_at: "2025-12-22T07:05:43.035Z"
updated_at: "2025-12-23T05:49:21.015Z"
decided_by: Architecture Team
decided_on: "2025-12-22T07:05:43.035Z"
enables: ["DOC-031"]
updated: 2026-01-17T18:28:11.819Z
---

## Context

When multiple plugins handle the same hook, how do they interact?

## Decision

Option A (Chain with priority ordering). Each plugin receives output of previous. Priority order is explicit in configuration.

## Rationale

Simple mental model (pipeline). Priority order is explicit in configuration. Plugins can build on each other's transformations. Most intuitive for common use cases (auth → logging → execution).

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-064") OR contains(file.frontmatter.enabled_by, "DEC-064")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```
