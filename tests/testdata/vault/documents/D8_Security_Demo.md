---
id: DOC-053
type: document
title: "D8: Security Demo"
workstream: business
status: Draft
created_at: "2026-01-13T04:41:03.710Z"
updated_at: "2026-01-13T05:27:49.643Z"
doc_type: spec
implemented_by: [M-038]
---

# D8: Security Demo

**Audience:** Security teams, compliance officers, risk managers  
**Goal:** Unblock enterprise adoption (they're often the blockers)  
**Length:** 15-20 minutes  
**Format:** Technical presentation + Live demo  
**Priority:** 🟢 As needed (Phase 3)

## Key Message

> "AEL was built with security-first design. Here's exactly how we protect your environment."

## ✅ No Code Blockers

All required engineering is already completed. The 7-layer sandbox is fully implemented.

## Engineering Dependencies (All Completed)

| Component | Milestone | Status |
|-----------|-----------|--------|
| **Python Exec Sandbox** | **M-010** | ✅ **Completed** |
| Logger (telemetry/audit) | M-003 | ✅ Completed |
| Error Registry | M-004 | ✅ Completed |

## 7-Layer Sandbox (M-010 - Completed)

1. Import restrictions (AST analysis) ✅
2. Builtin restrictions (no eval/exec/open) ✅
3. Tool allowlist ✅
4. Rate limiting ✅
5. Parameter validation ✅
6. Timeout enforcement ✅
7. Recursive prevention ✅

## Demo Flow (18 min)

1. **Threat Model Overview** (3 min, slides)
2. **7-Layer Sandbox Deep Dive** (10 min) - Live demos each layer
3. **Audit & Telemetry** (3 min)
4. **Premium Security Features** (2 min, slides)

## Workflow
- `security-demo.yaml` - Demonstrates safe vs blocked operations

## Content Dependencies

| Content | Status | Est. Time |
|---------|--------|-----------|
| security-demo.yaml | ❌ Needed | 0.5h |
| Security whitepaper | ❌ Needed | 4h |
| 7-layer documentation | ❌ Needed | 2h |
| Presentation slides | ❌ Needed | 2h |
| Threat model doc | ❌ Needed | 2h |

## Estimated Effort: 13.5 hours (all content)

## Source Document
Full specification: `demos/D8_SECURITY.md` in docs repo

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-053")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-053")
SORT decided_at DESC
```