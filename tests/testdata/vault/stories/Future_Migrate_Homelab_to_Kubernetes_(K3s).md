---
id: S-083
type: story
title: "Future: Migrate Homelab to Kubernetes (K3s)"
workstream: infra
status: In Progress
created_at: "2026-01-14T22:18:36.816Z"
updated_at: "2026-01-16T07:21:54.780Z"
effort: Engineering
priority: Medium
parent: M-001
children: ["T-156","T-157","T-158","T-159","T-160","T-161","T-162","T-163","T-253"]
depends_on: ["DEC-069","S-078"]
updated: 2026-01-16T20:48:42.474Z
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
WHERE contains(enables, "S-083")
SORT decided_at DESC
```