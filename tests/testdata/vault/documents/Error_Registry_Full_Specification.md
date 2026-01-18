---
id: DOC-035
type: document
title: Error Registry Full Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T13:03:41.361Z"
updated_at: "2026-01-07T13:04:18.019Z"
doc_type: spec
implemented_by: [M-004]
updated: 2026-01-12T03:49:11.380Z
---


Full Error Registry implementation for post-MVP. Extends minimal MVP with YAML templates, custom errors, tool mappings, retryability overrides.

## Template Sources (Priority Order)
1. API registered (Premium runtime)
2. User YAML (custom_errors in config - Premium)
3. System YAML (ael-errors.yaml - shipped with AEL)
4. Built-in (hardcoded - always loaded)

## Features

### YAML-Based Template Loading
System templates file (ael-errors.yaml) with code, category, message_template, detail_template, suggestion_template, default_retryable, default_http_status, docs_path, tags.

### Custom Error Registration (Premium)
Users define own errors in config or via API. Validation ensures no conflict with built-in codes.

### Tool Error Mappings
Map tool-specific errors to AEL behavior. Per-tool configuration for exception handling.

### Retryability Overrides
Configure retry behavior per error/context. Override defaults based on tool, workflow, or step.

### Advanced Matchers
Tool-specific exception handling. Chain of matchers with priority.

## Error Template Schema
- code: Unique error code (e.g., TOOL_UNAVAILABLE)
- category: TOOL, WORKFLOW, CONFIG, INPUT, INTERNAL
- message_template: User-facing message with placeholders
- detail_template: Technical details
- suggestion_template: Actionable guidance
- default_retryable: boolean
- default_http_status: HTTP status code
- docs_path: Link to documentation
- tags: Searchable tags

## Hot Reload
Registry watches config files and reloads on change without restart.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-035")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-035")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-035")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-035")
SORT decided_at DESC
```