---
id: DOC-050
type: document
title: "D5: Conference Demo"
workstream: business
status: Draft
created_at: "2026-01-13T04:41:03.685Z"
updated_at: "2026-01-13T05:00:20.832Z"
doc_type: spec
implemented_by: [M-035]
---

# D5: Conference Demo

**Audience:** Tech community, developers, AI enthusiasts  
**Goal:** Thought leadership, awareness, community building  
**Length:** 15-25 minutes (talk) + 5-10 min demo  
**Format:** Talk + Live demo  
**Priority:** 🟡 High (Phase 2)

## Key Message

> "The agent architecture is evolving. Here's why separating planning from execution matters, and how to do it."

## ✅ No Code Blockers

All required engineering is already completed. Shares workflow with D1.

## Engineering Dependencies (All Completed)

Same as D1:
| Component | Milestone | Status |
|-----------|-----------|--------|
| Workflow Engine | M-012 | ✅ Completed |
| MCP Frontend | M-013 | ✅ Completed |
| CLI | M-014 | ✅ Completed |
| Phase 0 Validation | M-030 | ✅ Completed |

## Talk Structure (25 min)

1. **Evolution of Agent Architecture** (5 min)
2. **The Insight** (5 min) - Paradigm shift
3. **Live Demo** (10 min) - extract-top-stories
4. **Road Ahead** (5 min) - OSS + Premium vision

## Workflow
- `extract-top-stories.yaml` - Same as D1 (shared)

## Content Dependencies

| Content | Status | Est. Time |
|---------|--------|-----------|
| Speaker deck (11 slides) | ❌ Needed | 3h |
| Demo script | ❌ Needed | 1h |
| Practice (3x) | ❌ Needed | 1.5h |
| Backup video | ❌ Needed | 1h |

## Estimated Effort: 8.5 hours (all content)

## Source Document
Full specification: `demos/D5_CONFERENCE.md` in docs repo

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-050")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-050")
SORT decided_at DESC
```