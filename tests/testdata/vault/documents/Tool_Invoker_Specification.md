---
id: DOC-026
type: document
title: Tool Invoker Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:41:28.988Z"
updated_at: "2026-01-07T13:04:18.047Z"
doc_type: spec
implemented_by: [M-011]
updated: 2026-01-12T03:49:11.375Z
---


Executes tool calls via MCP or directly for system tools. Handles routing, timeout, and error normalization.

## Dependencies
- Tool Registry (get tool info and routing)
- MCP Client Manager (for MCP tools)
- Python Exec Sandbox (for python_exec)
- Error Registry
- Logger

## Key Classes

### ToolInvocation (Dataclass)
tool_name, arguments, timeout, context (step_id, execution_id)

### ToolResult (Dataclass)
success, output, error (AELError), duration_ms

### ToolInvoker
- invoke(invocation) → ToolResult: Execute tool call
- invoke_batch(invocations) → List[ToolResult]: Future parallel execution

## Routing Logic
1. Get tool from Tool Registry
2. Check tool availability
3. Route based on source:
   - MCP tool → MCPClientManager.call_tool()
   - System tool (python_exec) → PythonExecSandbox.execute()
4. Apply timeout
5. Normalize result/error

## Error Handling
- Tool not found → TOOL_UNAVAILABLE
- Timeout → TOOL_TIMEOUT
- MCP error → TOOL_FAILED with details
- Validation error → PARAM_INVALID

## Telemetry
Emits tool call traces: tool_name, parameters, output summary, duration, success/failure

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-026")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-026")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-026")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-026")
SORT decided_at DESC
```