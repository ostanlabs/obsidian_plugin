---
id: DOC-033
type: document
title: Telemetry Store Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:59:41.469Z"
updated_at: "2026-01-07T13:04:18.044Z"
doc_type: spec
implemented_by: [M-025]
updated: 2026-01-15T23:48:49.123Z
---


Captures, stores, and exports execution telemetry for debugging, monitoring, analytics, and pattern mining. Wraps tool call traces with workflow context. Multiple storage backends.

## Dependencies
- Shared Types (ExecutionStatus, StepStatus)
- Workflow Engine, Tool Invoker, Config Loader, Error Registry, Logger

## Enums
- ExecutionType: WORKFLOW, DIRECT
- ExecutionStatus: PENDING, RUNNING, COMPLETED, FAILED, CANCELLED
- StepStatus: PENDING, RUNNING, COMPLETED, FAILED, SKIPPED
- StepType: TOOL, CODE
- ToolCallSource: TOOL_STEP, CODE_BLOCK

## Records

### ErrorRecord
code, category, message, detail, retryable, step_id, tool_name, cause (chain, max depth 3)

### ToolCallRecord
call_id, tool_name, started_at, completed_at, duration_ms, params (redactable), result (redactable), error, execution_id, step_id, source, sequence

### StepRecord
step_id, step_type, status, skip_reason, started_at, completed_at, duration_ms, tool_name, tool_params, tool_result, code_hash (SHA256), tool_calls[], error, attempt

### ExecutionRecord
execution_id, type, workflow_name, workflow_version, status, started_at, completed_at, duration_ms, inputs, outputs, steps[], error, caller_id, metadata

## Storage Backends
- Memory: Development/testing, no persistence
- SQLite: OSS default, local file storage
- PostgreSQL: Premium, long-term retention

## TelemetryStore Interface
- start_execution(), complete_execution(), fail_execution()
- start_step(), complete_step(), fail_step(), skip_step()
- record_tool_call()
- query(): Search/filter executions
- export(): JSON, CSV, OTLP

## Redaction Configuration
redact_inputs, redact_outputs, sensitive_field_patterns (regex), max_result_size

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-033")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-033")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-033")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-033")
SORT decided_at DESC
```