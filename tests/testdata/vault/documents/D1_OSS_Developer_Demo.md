---
id: DOC-046
type: document
title: "D1: OSS Developer Demo"
workstream: business
status: Draft
created_at: "2026-01-13T04:41:03.649Z"
updated_at: "2026-01-13T04:59:24.339Z"
doc_type: spec
implemented_by: [M-031]
---

# D1: OSS Developer Demo

**Audience:** Individual engineers, hobbyists, early adopters  
**Goal:** Get them to `pip install ael` and star the repo  
**Length:** 2-5 minutes  
**Format:** README GIF + Quick Start video  
**Priority:** 🔴 Critical (Phase 1)

## Key Message

> "Write YAML, get a tool. Claude calls your workflows like any other tool."

## ✅ No Code Blockers

All required engineering is already completed.

## Scope

### In Scope
- Installation demo (`pip install ael`)
- Simple workflow execution
- Claude Desktop integration
- Basic telemetry output

### Out of Scope
- Self-configuration (D2)
- Error handling deep dive (D3)
- Architecture details (D4)
- Security details (D8)

## Demo Variants

### Variant A: README GIF (15 seconds)
First impression, GitHub README hero image. Shows workflow YAML → ael serve → Claude executes → results.

### Variant B: Quick Start Video (5 minutes)
YouTube/docs tutorial. Full walkthrough of install → config → workflow → execution.

## Primary Workflow
`extract-top-stories.yaml` - Scrapes a URL and extracts headlines

## Engineering Dependencies (All Completed)

| Component | Milestone | Status |
|-----------|-----------|--------|
| Workflow Engine | M-012 | ✅ Completed |
| Workflow Registry | M-009 | ✅ Completed |
| Tool Invoker | M-011 | ✅ Completed |
| MCP Frontend | M-013 | ✅ Completed |
| CLI | M-014 | ✅ Completed |
| Config Loader | M-005 | ✅ Completed |
| Phase 0 Validation | M-030 | ✅ Completed |

## Content Dependencies

| Content | Status | Est. Time |
|---------|--------|-----------|
| extract-top-stories.yaml | ❌ Needed | 0.5h |
| Docker environment | ❌ Needed | 2h |
| Mock MCP server | ❌ Needed | 1h |
| README GIF | ❌ Needed | 1h |
| README update | ❌ Needed | 0.5h |
| Quick Start docs | ❌ Needed | 2h |

## Estimated Effort: 10 hours (all content, no code)

## Source Document
Full specification: `demos/D1_OSS_DEVELOPER.md` in docs repo

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-046")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-046")
SORT decided_at DESC
```