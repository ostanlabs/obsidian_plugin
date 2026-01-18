---
id: DOC-019
type: document
title: Workflow Engine Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:32:25.218Z"
updated_at: "2026-01-07T13:04:18.051Z"
doc_type: spec
implemented_by: [M-012]
updated: 2026-01-12T03:49:11.365Z
---


Execute workflow definitions step-by-step. Manages context, handles errors, implements retry logic, and produces execution results. The core of AEL.

## Dependencies
- Shared Types (ExecutionStatus, StepStatus, OnError, RetryConfig)
- Workflow Registry (fetch workflow definitions)
- Tool Invoker (execute tool steps)
- Template Engine (render parameters)
- Error Registry (error handling)
- Logger (execution logging)

## Key Data Structures

### StepResult
step_id, status (StepStatus), started_at, completed_at, duration_ms, output, error, skip_reason, attempt, max_attempts

### ExecutionResult
execution_id, workflow_id, workflow_version, status (ExecutionStatus), inputs, outputs, step_results[], started_at, completed_at, duration_ms, error

### ExecutionContext
workflow, inputs, config, outputs{}, steps{}, execution_id, workflow_version. Methods: set_step_result(), get_step_output()

## WorkflowEngine Class

### execute(workflow_id, inputs, config) → ExecutionResult
Main entry point. Fetches workflow, validates inputs, executes steps, collects outputs.

### _execute_step(step, context) → StepResult
Executes single step with retry logic. Handles tool steps vs code steps.

### _execute_with_retry(step, context) → StepResult
Retry wrapper with exponential/linear backoff.

## Execution Flow
1. Get workflow from registry
2. Validate inputs
3. Execute steps in order (respecting depends_on)
4. Handle errors per on_error setting (fail|skip|retry)
5. Collect outputs
6. Return ExecutionResult

## Error Handling
- on_error: fail → Stop workflow, return error
- on_error: skip → Mark step skipped, continue
- on_error: retry → Retry with backoff, then fail/skip

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-019")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-019")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-019")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-019")
SORT decided_at DESC
```