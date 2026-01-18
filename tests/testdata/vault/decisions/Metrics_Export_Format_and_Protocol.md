---
id: DEC-066
type: decision
title: Metrics Export Format and Protocol
workstream: engineering
status: Decided
created_at: "2026-01-14T18:41:15.015Z"
updated_at: "2026-01-14T22:18:11.791Z"
depends_on: ["DEC-065"]
blocks: ["S-072"]
updated: 2026-01-17T16:02:43.404Z
---

## Context

Once telemetry is collected, it needs to be exported in a format that monitoring systems can ingest. This affects what dashboards and alerting systems we can use.

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-066") OR contains(file.frontmatter.enabled_by, "DEC-066")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```