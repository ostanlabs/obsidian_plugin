---
id: DOC-003
type: document
title: Python Exec Architecture
workstream: engineering
status: Draft
created_at: "2025-12-22T07:08:25.899Z"
updated_at: "2026-01-07T13:04:18.040Z"
doc_type: spec
implemented_by: [M-010]
updated: 2026-01-12T03:49:11.336Z
---


Python Exec serves a dual role in AEL: it is both the internal runtime for executing workflow logic and an explicit tool that users can invoke for complex transformations. Both paths use the same security sandbox.

## Dual Role Model
ROLE 1 - Internal Runtime (Implicit): Executes inline code: blocks in workflow steps, users don't explicitly invoke it, uses system default configuration, for straightforward transforms.
ROLE 2 - Explicit Tool (User-Invoked): Called as tool: python_exec, user can configure timeout/imports/limits, visible in traces as distinct tool call, for complex processing.

## When to Use Which
- Implicit: Simple filter/map, data validation, quick transforms
- Explicit: Complex processing, long-running computation, custom import needs, need explicit metrics

## Security Model (7-layer sandbox)
1. Import Restrictions - AST-based whitelist
2. Builtin Restrictions - No eval, exec, compile, open, __import__
3. Tool Whitelist - Only allowed tools callable
4. Rate Limiting - Max tool calls per execution
5. Parameter Validation - JSON-serializable params only
6. Timeout Enforcement - Configurable per execution
7. Recursive Prevention - python_exec cannot call python_exec

## Configuration Precedence
1. Explicit step params (highest)
2. Workflow-level defaults
3. System defaults (ael-config.yaml)
4. Hardcoded defaults (lowest)

## Observability
- Implicit mode: execution_mode=inline_code, bundled with step metrics
- Explicit mode: execution_mode=python_exec_tool, distinct tool call in metrics

## Tool Registry Status
Python Exec appears as a SYSTEM TOOL alongside external MCP tools.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-003")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-003")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-003")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-003")
SORT decided_at DESC
```