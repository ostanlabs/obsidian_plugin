---
id: DOC-047
type: document
title: "D2: Investor Demo"
workstream: business
status: Draft
created_at: "2026-01-13T04:41:03.659Z"
updated_at: "2026-01-13T04:59:08.065Z"
doc_type: spec
implemented_by: [M-032]
updated: 2026-01-17T07:16:05.756Z
---

# D2: Investor Demo

**Audience:** VCs, angels, strategic investors  
**Goal:** Communicate category creation, market opportunity, team capability  
**Length:** 10-15 minutes (demo portion of larger pitch)  
**Format:** Slides + Live demo + Q&A  
**Priority:** 🔴 Critical (Phase 1)

## Key Message

> "We're building the Kubernetes for AI agents. LLMs plan, AEL executes. This is the missing infrastructure layer that makes agents enterprise-ready."

## ⚠️ BLOCKED

**This demo depends on S-044 (Self-Configuration MCP Tools) in M-029 (Phase 1: MVP Polish).**

The self-configuration feature allows the agent to configure its own infrastructure, which is the "magic moment" of this demo.

## Scope

### In Scope
- Self-configuration demo (agent configures its own infrastructure)
- Token savings comparison
- Premium vision (pattern mining, synthesis)
- Business model / upgrade path

### Out of Scope
- Deep architecture (D4)
- Enterprise-specific features (D3)
- Security deep dive (D8)

## Demo Flow (15 min)

1. **Problem** (2 min, slides) - 6 systemic failures
2. **Paradigm Shift** (2 min, slides) - Terraform/K8s analogy
3. **Self-Config Demo** (4 min, live) - Agent configures AEL
4. **Token Savings** (2 min, slides + live) - 75% reduction
5. **Premium Vision** (2 min, slides) - Pattern mining, synthesis
6. **Business Model** (2 min, slides) - Open core flywheel
7. **Category Creation** (1 min, slides) - "Not a gateway, not a framework"

## Engineering Dependencies

| Component | Status | Notes |
|-----------|--------|-------|
| Core AEL (M-012 Workflow Engine) | ✅ Completed | Baseline |
| Sandbox (M-010) | ✅ Completed | Baseline |
| MCP Frontend (M-013) | ✅ Completed | Baseline |
| **S-044 Self-Configuration** | ❌ NOT STARTED | **BLOCKER** |
| **M-029 Phase 1 MVP Polish** | ❌ NOT STARTED | Parent of S-044 |

## Content Dependencies

| Content | Status | Est. Time |
|---------|--------|-----------|
| Pitch deck | ❌ Needed | 4h |
| Token comparison | ❌ Needed | 1h |
| Backup video | ❌ Needed | 2h |
| Demo practice (10x) | ❌ Needed | 3h |

## Key Moments

| Moment | Emotional Beat |
|--------|---------------|
| "No config found" | Intrigue |
| Claude configures AEL | "Wow" - magic |
| Tools appear | Relief - it works |
| Token savings | "This saves money" |

## Estimated Effort: 25 hours (including S-044: 10h code + 15h content)

## Premium Appendix
Deep dive materials available for investor follow-up questions on:
- Pattern Mining algorithm
- Workflow Synthesis process
- Cost Accounting model

## Source Document
Full specification: `demos/D2_INVESTOR.md` in docs repo

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-047")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-047")
SORT decided_at DESC
```