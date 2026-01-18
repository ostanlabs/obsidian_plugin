---
id: DOC-029
type: document
title: Python Exec Sandbox Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:55:52.539Z"
updated_at: "2026-01-07T13:04:18.041Z"
doc_type: spec
implemented_by: ["S-037"]
updated: 2026-01-17T18:14:41.428Z
---


Execute Python code blocks securely within a sandboxed environment. Reused from agent framework's CodeExecutionSandbox.

## Dependencies
- Shared Types (StepOutput)
- Error Registry
- Logger

## 7-Layer Security Model

1. **Import Restrictions**: AST-based whitelist. Only allowed modules can be imported.
2. **Builtin Restrictions**: No eval, exec, compile, open, __import__, globals, locals, getattr/setattr/delattr, breakpoint
3. **Tool Whitelist**: Only tools from Tool Registry can be called
4. **Rate Limiting**: Max tool calls per execution (default: 10)
5. **Parameter Validation**: Tool params must be JSON-serializable
6. **Timeout Enforcement**: Execution killed after timeout
7. **Recursive Prevention**: python_exec cannot call python_exec

## Key Classes

### SandboxConfig
timeout (30), max_tool_calls (10), allowed_imports (stdlib defaults)

### SandboxContext
Available to code: context.inputs, context.steps, context.config, context.tools.call()

### ToolCallerProtocol
Protocol interface to break circular dependency with ToolInvoker. Method: call(tool_name, params)

### ToolCallInterface
Wraps ToolCallerProtocol with rate limiting and recursion prevention.

### CodeExecutionResult
success, output, error (AELError), duration_ms, tool_calls

### PythonExecSandbox
- execute(code, context, config) → CodeExecutionResult
- validate_code(code, config) → List[str] errors

## Import Profiles
- STANDARD: json, re, datetime, math, random, typing, collections, itertools, functools, hashlib, uuid, base64, urllib.parse
- COMMON: STANDARD + requests, pydantic, jmespath, dateutil, yaml

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-029")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-029")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-029")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-029")
SORT decided_at DESC
```