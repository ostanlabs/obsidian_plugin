---
id: DEC-062
type: decision
title: Plugin Lifecycle and State
workstream: engineering
status: Decided
archived: false
created_at: "2025-12-22T07:05:34.743Z"
updated_at: "2025-12-23T05:49:04.701Z"
decided_by: Architecture Team
decided_on: "2025-12-22T07:05:34.743Z"
enables: ["DOC-031"]
updated: 2026-01-17T18:28:11.815Z
---

## Context

Are plugins singleton (one instance shared) or per-execution? Can they maintain state?

## Decision

Option C (Singleton with execution context). One instance across all executions, but receives context per call.

## Rationale

Matches common plugin patterns (logging, metrics need global state). Execution context provides per-execution isolation when needed. Plugin authors can choose their state management strategy. Most observability plugins need cross-execution aggregation.

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-062") OR contains(file.frontmatter.enabled_by, "DEC-062")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```
