---
id: M-032
type: milestone
title: "D2: Investor Demo"
workstream: business
status: Not Started
created_at: 2026-01-13T04:41:15.101Z
updated_at: 2026-01-13T11:26:40.706Z
priority: Medium
depends_on: ["M-031"]
blocks: ["M-037","M-035","M-033"]
implements: ["DOC-047"]
updated: 2026-01-17T06:45:22.404Z
children: ["S-048","S-049"]
---

## 📄 Documents

```dataview
TABLE title as "Document", document_type as "Type", version as "Version"
FROM "documents"
WHERE contains(this.implements, id)
SORT title ASC
```

## 🎯 Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(enables, "M-032")
SORT decided_at DESC
```