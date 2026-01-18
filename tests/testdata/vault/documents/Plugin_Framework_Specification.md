---
id: DOC-031
type: document
title: Plugin Framework Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:57:34.919Z"
updated_at: "2026-01-07T13:04:18.037Z"
doc_type: spec
implemented_by: ["M-024"]
updated: 2026-01-17T07:16:05.745Z
enabled_by: ["DEC-063","DEC-062","DEC-064"]
---


Extension system for AEL allowing plugins to observe, transform, and (Premium) control workflow execution. OSS plugins: log, emit metrics, transform data. Premium plugins: +skip, abort, retry, wait.

## Dependencies
- Shared Types, Workflow Engine, Tool Invoker, Config Loader, Error Registry, Logger
- Premium only: License Validator

## Related Decisions
DEC-059 (Base Class API), DEC-060 (Return Types), DEC-061 (Premium Enforcement), DEC-062 (Lifecycle), DEC-063 (Sync/Async), DEC-064 (Execution Order)

## Plugin Decisions (Premium Only)
- CONTINUE: Proceed normally
- SKIP: Skip current step
- ABORT: Abort entire workflow
- RETRY: Retry current step
- WAIT: Wait for external event (future)

## Hook Contexts
- RequestContext: execution_id, workflow_name, workflow_version, inputs, caller_id, timestamp, metadata
- StepContext: execution_id, workflow_name, step_id, step_index, goal, tool_name, tool_params, code, previous_outputs
- StepResult: success, output, error, duration_ms, traces
- ResponseContext: execution_id, workflow_name, success, outputs, duration_ms, error

## Base Classes

### OSSPlugin (ABC)
- on_request_received(context, inputs) → Dict (modified inputs)
- on_step_before(context, params) → Dict (modified params)
- on_step_after(context, result) → StepResult (modified result)
- on_response_ready(context, outputs) → Dict (modified outputs)

### PremiumPlugin (OSSPlugin)
- Same methods but return HookResult[T] with decision field
- Enables skip/abort/retry/wait decisions

## Plugin Configuration
name, enabled, priority (lower=earlier), fail_open (default true for observability), config dict

## Built-in Plugins
OSS: logging, metrics, request-transform, response-transform, tracing
Premium: policy (Cedar/Rego), approval, retry, circuit-breaker

## Execution Model
- Singleton lifecycle with execution context per call
- OSS: Synchronous only
- Premium: Sync + async support
- Chain execution in priority order (auth=10, logging=50, metrics=90)
- fail_open controls whether plugin errors abort workflow

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-031")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-031")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-031")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-031")
SORT decided_at DESC
```