---
id: DOC-002
type: document
title: OSS vs Premium Split
workstream: business
status: Draft
created_at: "2025-12-22T07:07:54.386Z"
updated_at: "2026-01-07T13:04:18.035Z"
doc_type: spec
implemented_by: ["M-021"]
updated: 2026-01-17T18:28:11.824Z
---


AEL follows an open-core business model: OSS core for developer adoption, Premium/Enterprise for monetization.

## Strategic Intent
- OSS (Community): Developer adoption, ecosystem growth - Individual developers, startups
- Premium (Enterprise): Revenue, enterprise value - Platform teams, large organizations

## OSS Core Features
DATA PLANE: MCP Frontend, HTTP API Frontend, Execution Orchestrator, Workflow Engine (YAML, linear + branching DAG), Tool Invoker, Outbound Connectors
CONTROL PLANE: Tool Registry, Workflow Registry, Management API, Config Sync
DEVELOPER EXPERIENCE: CLI, Plugin Framework (observability only)
OBSERVABILITY: Structured Logging, Basic Metrics, Telemetry

## Premium Features
SECURITY & GOVERNANCE: RBAC/ABAC, Policy Engine (Cedar/Rego), SSO Integration, Compliance & Auditability
ADVANCED ORCHESTRATION: Parallel execution, retry/backoff, compensation, approval steps, Composite Tool Publishing
LEARNING & OPTIMIZATION: Telemetry Store, Tool Profiler, Pattern Miner, LLM Workflow Synthesizer, Recommendation Engine, Tool Selection Engine
ENTERPRISE CONSOLE: Workflow Library, Visual Builder, Tool Catalog, Policy Editor, Execution Explorer
ENTERPRISE OPERATIONS: Multi-Tenancy, Multi-Node Runtime, Kubernetes Operator, Cost Accounting

## Key Boundary Decisions
- Workflow execution: OSS=Linear+branch, Premium=+Parallel,loops,compensation
- Plugin control flow: OSS=Observe/transform, Premium=+Skip,abort,retry,wait
- Workflow source: OSS=Human-authored, Premium=+LLM-synthesized
- Multi-tenancy: Premium only
- Policy enforcement: OSS=Basic validation, Premium=Cedar/Rego

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-002")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-002")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-002")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-002")
SORT decided_at DESC
```