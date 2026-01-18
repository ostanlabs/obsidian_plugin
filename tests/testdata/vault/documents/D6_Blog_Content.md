---
id: DOC-051
type: document
title: "D6: Blog Content"
workstream: business
status: Draft
created_at: "2026-01-13T04:41:03.693Z"
updated_at: "2026-01-13T05:27:27.041Z"
doc_type: spec
implemented_by: [M-036]
---

# D6: Blog Content

**Audience:** Developers researching solutions, SEO traffic  
**Goal:** Education, awareness, SEO, thought leadership  
**Length:** Various (1000-2500 words each)  
**Format:** Written articles with code examples  
**Priority:** 🟢 Ongoing (Phase 3)

## ✅ No Code Blockers

Content-only deliverable. Uses completed engineering for examples.

## Engineering Dependencies (All Completed)

Uses workflows/examples from completed milestones:
- M-012 Workflow Engine ✅
- M-030 Phase 0 (sample workflows) ✅

## Phase 1 Articles

1. **"Your First AEL Workflow in 5 Minutes"** (4h)
2. **"AEL vs Raw MCP: When to Use What"** (5h)
3. **"Understanding Token Costs in Multi-Step Agent Tasks"** (3h)

## Estimated Effort: 15 hours (all content)

## Source Document
Full specification: `demos/D6_BLOG_CONTENT.md` in docs repo

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-051")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-051")
SORT decided_at DESC
```