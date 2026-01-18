---
id: DOC-006
type: document
title: SDK Strategy
workstream: engineering
status: Draft
created_at: "2025-12-22T07:09:50.212Z"
updated_at: "2026-01-07T13:04:18.043Z"
doc_type: spec
implemented_by: ["M-028"]
updated: 2026-01-17T18:14:41.416Z
---


AEL follows a CLI-first approach. SDK comes later as adoption grows and programmatic integration becomes necessary.

## Phased Rollout
- OSS Phase 1: CLI only (initial release, developers testing locally)
- OSS Phase 2: Python SDK (post-adoption, developers embedding in apps)
- Premium: Python + JS + Go SDKs (enterprise release, polyglot teams)

## Why CLI First
CLI sufficient for: Developer testing, CI/CD pipelines
SDK needed for: Agent calling AEL at runtime (latency), embedding in application code, enterprise custom orchestration

MCP protocol itself acts as a "protocol SDK" for agents.

## CLI Scope (Phase 1)
Core: ael run, ael test, ael list tools/workflows, ael describe tool/workflow
Development: ael validate, ael init
Configuration: ael config show/set

## Python SDK Scope (Phase 2)
- Client initialization with config
- Execute workflow with typed inputs
- Programmatic workflow definition
- Tool operations (list, describe)

## Premium SDK Additions
Languages: Python (primary), JavaScript/TypeScript (web/Node.js), Go (high-performance/K8s)
Features: Async/streaming, batch execution, tenant management, policy management, advanced error handling

## SDK vs MCP Protocol
MCP Protocol: Standard, works with any MCP client; protocol overhead, less type safety
SDK: Type safe, language-native, richer API; language-specific dependency

Both are valid integration methods. SDK provides better DX for deep integrations.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-006")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-006")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-006")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-006")
SORT decided_at DESC
```