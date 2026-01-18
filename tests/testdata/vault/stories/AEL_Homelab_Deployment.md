---
id: S-078
type: story
title: AEL Homelab Deployment
workstream: infra
status: In Progress
created_at: 2026-01-14T18:42:02.879Z
updated_at: 2026-01-16T07:21:54.778Z
effort: Engineering
priority: Medium
parent: 
children: ["T-133","T-254","T-134","T-129","T-132","T-130","T-255","T-131"]
depends_on: ["S-079","S-056"]
updated: 2026-01-17T18:28:11.799Z
blocks: ["S-082","S-080","S-083"]
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
WHERE contains(enables, "S-078")
SORT decided_at DESC
```