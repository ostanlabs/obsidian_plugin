---
id: DOC-030
type: document
title: Workflow Registry Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:56:40.731Z"
updated_at: "2026-01-07T13:04:18.051Z"
doc_type: spec
implemented_by: [M-009]
updated: 2026-01-12T03:49:11.379Z
---


Store, validate, and retrieve workflow definitions. Loads workflows from directory, validates against schema, provides hot-reload on file changes.

## Dependencies
- Shared Types (StepType, OnError, BackoffType, ValidationIssue, ValidationResult)
- Tool Registry (tool existence validation)
- Config Loader, Error Registry, Logger

## Workflow Data Model

### WorkflowDefinition
name, version, description, packages (PackagesConfig), defaults (WorkflowDefaults), inputs (List[InputDefinition]), steps (List[StepDefinition]), outputs (List[OutputDefinition]), source_path, yaml_content
Methods: get_step(id), get_execution_order(), get_input_schema(), get_output_schema()

### StepDefinition
id, tool (optional), code (optional), params, depends_on, on_error, timeout, retry
Property: step_type (TOOL or CODE)

### InputDefinition
name, type, required, default, description, enum, pattern, minimum, maximum

### OutputDefinition
name, from_path, value, description

## WorkflowValidator
validate(workflow, check_tools) → ValidationResult
Checks: required fields, valid types, unique step IDs, valid depends_on, no circular deps, tool XOR code, tool exists, valid template syntax

## WorkflowRegistry
- initialize() → int: Load workflows from directory
- register(workflow), register_from_yaml(yaml, path)
- unregister(name), get(name), get_or_raise(name), list()
- validate_yaml(yaml) → ValidationResult
- get_for_mcp_exposure() → List[Dict]: Workflows as MCP tools
- snapshot(name): Frozen copy for execution
- start_watching(), stop_watching(): Hot-reload

## Input Normalization
Supports lightweight syntax: ["url", "timeout: 30"] normalizes to full InputDefinition objects

## Validation Rules
- name/version required (Error)
- steps non-empty (Error)
- unique step IDs (Error)
- valid depends_on references (Error)
- no circular dependencies (Error)
- tool XOR code per step (Error)
- tool exists (Warning)
- valid template syntax (Error)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-030")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-030")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-030")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-030")
SORT decided_at DESC
```