---
id: DOC-049
type: document
title: "D4: Enterprise Architect Demo"
workstream: business
status: Draft
created_at: "2026-01-13T04:41:03.677Z"
updated_at: "2026-01-13T05:00:03.126Z"
doc_type: spec
implemented_by: [M-034]
---

# D4: Enterprise Architect Demo

**Audience:** Enterprise architects, senior engineers doing evaluation  
**Goal:** Technical validation, POC approval  
**Length:** 30-45 minutes  
**Format:** Architecture deep dive + Hands-on + Q&A  
**Priority:** 🟢 As needed (Phase 3)

## Key Message

> "Let's get into the technical details. Here's how AEL works, how it integrates, and how it scales."

## ✅ No Code Blockers

All required engineering is already completed.

## Engineering Dependencies (All Completed)

| Component | Milestone | Status |
|-----------|-----------|--------|
| Python Exec Sandbox | M-010 | ✅ Completed |
| Workflow Engine | M-012 | ✅ Completed |
| MCP Client Manager | M-006 | ✅ Completed |
| Tool Registry | M-007 | ✅ Completed |
| Config Loader | M-005 | ✅ Completed |
| Logger (OTLP) | M-003 | ✅ Completed |

## Demo Flow (40 min)

1. **Architecture Deep Dive** (10 min) - Component diagram, request lifecycle
2. **7-Layer Sandbox** (8 min) - Layer-by-layer with live demos
3. **Integration Points** (10 min) - MCP transport, Auth, OTLP
4. **Hands-On Walkthrough** (10 min) - Create workflow from scratch
5. **Q&A** (5 min)

## Workflows
- `api-aggregator.yaml` - Integration pattern demo
- `security-demo.yaml` - Sandbox demonstration

## Content Dependencies

| Content | Status | Est. Time |
|---------|--------|-----------|
| api-aggregator.yaml | ❌ Needed | 0.5h |
| security-demo.yaml | ❌ Needed | 0.5h |
| Architecture docs | ❌ Needed | 4h |
| 7-layer security doc | ❌ Needed | 2h |
| Hands-on lab guide | ❌ Needed | 2h |

## Estimated Effort: 16 hours (all content)

## Source Document
Full specification: `demos/D4_ENTERPRISE_ARCHITECT.md` in docs repo

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-049")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-049")
SORT decided_at DESC
```