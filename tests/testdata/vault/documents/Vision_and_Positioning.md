---
id: DOC-001
type: document
title: Vision and Positioning
workstream: business
status: Draft
created_at: "2025-12-22T07:06:56.778Z"
updated_at: "2026-01-07T13:04:18.051Z"
doc_type: spec
implemented_by: ["M-020"]
updated: 2026-01-17T18:28:11.823Z
---


AEL (Agent Execution Layer) is a deterministic runtime for agent actions that replaces LLM-driven orchestration. It represents a paradigm shift: LLMs should plan, AEL should execute.

## Core Concept
TODAY: LLM = planner + executor + workflow engine (fragile, expensive)
WITH AEL: LLM = planner + intent interpreter, AEL = deterministic tool orchestrator

## Problems AEL Solves
- Unreliable: LLMs hallucinate steps → Deterministic workflows
- Unpredictable costs: Every action requires tokens → Fixed-path execution
- Opaque: No auditability → Full telemetry and traces
- Non-deterministic: Same request → different behavior → Same inputs → same outputs
- Ungovernable: No policy enforcement → Built-in governance layer
- Developer pain: Reinventing orchestration → Reusable workflow definitions

## What AEL Is
- A new execution primitive for agentic systems
- Deterministic, governed, observable, tool-native
- The "Kubernetes for agent execution"

## What AEL Is Not
- Not an API gateway
- Not a workflow engine (though it contains one)
- Not an agent framework
- Not an MCP proxy

## One-Line Positioning
We replace LLM-driven tool orchestration with a deterministic, governed execution layer—finally making agent systems predictable, reusable, and enterprise-ready.

## Target Users
- Agent Developers: Reliable tool execution, deterministic workflows, testability
- Platform Teams: Scalable agent infrastructure, multi-tenancy, observability
- Enterprise: Governance and compliance, policies, audit logs, cost control

## Key Architectural Principle
Separation of Concerns:
- Agent (LLM): Intent interpretation, planning, deciding WHAT to do
- AEL: Deterministic execution, HOW to do it reliably

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-001")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-001")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-001")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-001")
SORT decided_at DESC
```