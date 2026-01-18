---
id: DOC-028
type: document
title: Shared Types Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:55:04.649Z"
updated_at: "2026-01-07T13:04:18.043Z"
doc_type: spec
implemented_by: ["S-042"]
updated: 2026-01-17T18:14:41.425Z
---


Foundation layer (-1) defining shared types used across multiple AEL components. Prevents duplication and ensures consistency. No dependencies.

## Shared Enumerations

### Logging
- LogLevel: DEBUG, INFO, WARN, ERROR
- LogFormat: COLORED, JSON

### Error Handling
- BackoffType: FIXED, EXPONENTIAL
- OnError: FAIL, SKIP, RETRY

### Sandbox
- PackageProfile: STANDARD, COMMON

### MCP
- MCPTransport: STDIO, HTTP
- ConnectionStatus: CONNECTED, DISCONNECTED, ERROR, CONNECTING

### Workflow Execution
- StepType: TOOL, CODE
- ExecutionStatus: PENDING, RUNNING, COMPLETED, FAILED, CANCELLED
- StepStatus: PENDING, RUNNING, COMPLETED, FAILED, SKIPPED

### Tools
- ToolSource: MCP, HTTP, SYSTEM
- ToolStatus: AVAILABLE, UNAVAILABLE, UNKNOWN

## Configuration Types
- RetryConfig: max_attempts, backoff (BackoffType), delay_seconds

## Execution Types
- StepOutput: output, success, duration_ms, step_id (used in templates as steps.fetch.output)
- ToolCallContext: step_id, execution_id, workflow_id (for logging/tracing)

## Validation Types
- ValidationIssue: path, message, severity (error/warning), line
- ValidationResult: valid, errors[], warnings[]

## Usage
All specs import from ael.types: `from ael.types import LogLevel, RetryConfig, StepOutput`
No duplicate type definitions allowed across specs.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-028")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-028")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-028")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-028")
SORT decided_at DESC
```