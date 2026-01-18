---
id: DOC-040
type: document
title: MVP Spec Deviations
workstream: engineering
status: Draft
created_at: "2025-12-22T13:09:37.767Z"
updated_at: "2026-01-07T13:04:18.035Z"
doc_type: spec
implemented_by: ["M-028"]
updated: 2026-01-16T20:56:24.019Z
---


Tracks deviations from implementation specs in MVP release. Status: Resolved - All critical deviations addressed.

## Resolved Deviations ✅

### Deviation 1: Missing validate_code() Method
Status: ✅ Implemented in Session 1
- Validates syntax using ast.parse()
- Validates imports using _validate_imports()
- Returns list of error messages

## Remaining Deviations (Minor)

### Deviation 2: PythonExecSandbox API Signature
Severity: 🟡 Medium - Works but differs from spec

Spec:
- __init__ takes SandboxConfig object, optional AELLogger
- execute() takes SandboxContext object
- Returns CodeExecutionResult

MVP Implementation:
- __init__ uses individual parameters (tool_caller, allowed_imports, timeout, max_output_size)
- execute() accepts dict context
- Returns SandboxResult

Workaround: ToolInvoker converts SandboxContext to dict before calling execute.
Future fix optional: 4-6 hours to align API.

### Deviation 3: SandboxResult vs CodeExecutionResult
Severity: 🟢 Low - Naming difference only

| Spec | MVP |
|------|-----|
| CodeExecutionResult | SandboxResult |
| output | result |
| duration_ms (int) | execution_time (float seconds) |
| - | stdout, stderr (extra) |

Impact: None - ToolInvoker handles conversion
Future fix: 30 minutes (optional)

## Summary
All tests pass. Remaining deviations are non-blocking and can be addressed post-MVP.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-040")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-040")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-040")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-040")
SORT decided_at DESC
```