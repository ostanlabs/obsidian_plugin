---
id: DOC-024
type: document
title: Error Registry Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:38:29.414Z"
updated_at: "2026-01-07T13:04:18.021Z"
doc_type: spec
implemented_by: [M-004]
updated: 2026-01-12T03:49:11.370Z
---


Centralized error definitions with context-aware instantiation. Errors are first-class data with consistent structure.

## Error Categories
- TOOL: TOOL_UNAVAILABLE, TOOL_TIMEOUT, TOOL_REJECTED, TOOL_FAILED
- EXECUTION: CODE_SYNTAX, CODE_RUNTIME, CODE_TIMEOUT, CODE_SECURITY, TEMPLATE_ERROR
- VALIDATION: INPUT_INVALID, PARAM_INVALID, OUTPUT_INVALID
- WORKFLOW: STEP_NOT_FOUND, CIRCULAR_DEPENDENCY, WORKFLOW_TIMEOUT
- SYSTEM: INTERNAL_ERROR, RESOURCE_EXHAUSTED, CONFIGURATION_ERROR

## AELError Dataclass
code, category, message, detail, suggestion, docs_url, retryable, context{}, cause (original exception)

## ErrorRegistry Class
- register(code, template) - Register error with message template
- create(code, **context) → AELError - Create error with context interpolation
- is_retryable(code) → bool - Check if error is retryable

## Error Templates
Templates with placeholders: "Tool '{tool_name}' is unavailable: {reason}"
Context interpolation at creation time.

## Exception Mapping
ExceptionMatcher: Maps Python exceptions to AEL errors by type, message pattern, or tool name.
map_exception(exception, context) → AELError

## Retryability
Defined per error code in registry:
- Retryable: TOOL_TIMEOUT, TOOL_UNAVAILABLE (transient)
- Not retryable: CODE_SYNTAX, INPUT_INVALID (permanent)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-024")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-024")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-024")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-024")
SORT decided_at DESC
```