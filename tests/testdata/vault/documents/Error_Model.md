---
id: DOC-012
type: document
title: Error Model
workstream: engineering
status: Draft
created_at: "2025-12-22T07:15:44.882Z"
updated_at: "2026-01-07T13:04:18.018Z"
doc_type: spec
implemented_by: [M-004]
updated: 2026-01-12T03:49:11.355Z
---


The Error Model defines how AEL handles, categorizes, and communicates failures using an Error Registry pattern where errors are first-class data.

## Design Principles
1. Errors are data - Structured, consistent, queryable
2. Context-aware - Same error code, different context = different message
3. Actionable - Every error includes suggestion and docs link
4. Extensible - Supports Premium customization
5. Minimal MVP - Simple implementation first

## Error Taxonomy (by source)
TOOL: TOOL_UNAVAILABLE, TOOL_TIMEOUT, TOOL_REJECTED, TOOL_FAILED
EXECUTION: CODE_SYNTAX, CODE_RUNTIME, CODE_TIMEOUT, CODE_SECURITY, TEMPLATE_ERROR
VALIDATION: INPUT_INVALID, PARAM_INVALID, OUTPUT_INVALID
WORKFLOW: STEP_NOT_FOUND, CIRCULAR_DEPENDENCY, WORKFLOW_TIMEOUT
SYSTEM: INTERNAL_ERROR, RESOURCE_EXHAUSTED, CONFIGURATION_ERROR

## Error Structure
AEL Error dataclass with: code, category, message, detail, suggestion, docs_url, retryable, context (step_id, tool_name, etc.), cause (original exception)

## Error Registry
Registered errors with templates for consistent messaging. Context-aware instantiation interpolates values.

## Error Retryability
Determined by error registry (not caller guessing). Examples: TOOL_TIMEOUT=retryable, CODE_SYNTAX=not retryable

## Exception Mapping
Matcher-based mapping from Python exceptions to AEL errors. Matchers by exception type, message pattern, tool name.

## OSS Retry Support
Simple retry with fixed/exponential backoff. Premium adds advanced policies, jitter, retryable_errors filtering.

## Error Chain Depth
Preserve up to 3 levels of cause chain for debugging while keeping errors manageable.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-012")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-012")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-012")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-012")
SORT decided_at DESC
```