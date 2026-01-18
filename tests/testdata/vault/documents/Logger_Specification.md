---
id: DOC-027
type: document
title: Logger Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:54:25.417Z"
updated_at: "2026-01-07T13:04:18.030Z"
doc_type: spec
implemented_by: [M-003, S-043]
---


Hierarchical, colored logging for AEL execution. Adapted from agent framework's ToolsLogger and colored_metrics.

## Dependencies
- Shared Types (LogLevel, LogFormat)

## Logger Classes

### AELLogger
Main facade. Creates component-specific loggers.
- workflow(workflow_id, execution_id) → WorkflowLogger
- configure(config) - Update config for hot-reload

### WorkflowLogger
Workflow-level events.
- started(version), completed(duration_ms, step_count), failed(error, duration_ms)
- step(step_id) → StepLogger

### StepLogger
Step-level events.
- started(step_type, tool_name), completed(duration_ms), skipped(reason), failed(error)
- retrying(attempt, max_attempts, delay_seconds)
- tool() → ToolLogger, sandbox() → SandboxLogger

### ToolLogger
Tool call events.
- calling(tool_name, params), result(tool_name, result, duration_ms), error(tool_name, error, duration_ms)

### SandboxLogger
Python sandbox events.
- executing(), imports_validated(), completed(duration_ms, tool_calls), error(error_type, message)

## LogConfig
level (INFO), format (COLORED), show_params (true), show_results (true), truncate_at (200), components dict

## Output Formats
- Colored Format (Development): Hierarchical with indentation, colors per component
- JSON Format (Production): Structured JSON lines for log aggregation

## Color Scheme
Workflow=Cyan, Step=Green, Tool=Magenta, Sandbox=Gray, Success=Green, Error=Red, Warning=Yellow

## Key Behaviors
- Hierarchical indentation per level
- Values truncated at truncate_at chars
- Respects show_params/show_results config
- Thread-safe for concurrent executions
- Lazy evaluation (don't format unlogged messages)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-027")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-027")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-027")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-027")
SORT decided_at DESC
```