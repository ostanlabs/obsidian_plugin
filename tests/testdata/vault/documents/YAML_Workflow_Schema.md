---
id: DOC-009
type: document
title: YAML Workflow Schema
workstream: engineering
status: Draft
created_at: "2025-12-22T07:11:47.915Z"
updated_at: "2026-01-07T13:04:18.052Z"
doc_type: spec
implemented_by: [M-012, M-009]
updated: 2026-01-12T03:49:11.350Z
---


The YAML Workflow Schema defines how users express deterministic workflows in AEL. It supports tool invocation, inline Python code, templated parameters, and explicit input/output declarations.

## Core Design Principles
1. Simple cases stay simple - Linear workflows need minimal boilerplate
2. Explicit over implicit - Dependencies, outputs, and context access are clear
3. Tool schemas from registry - Users don't redeclare tool schemas
4. Forward compatible - Unknown fields are ignored
5. Extensible for Premium

## Step Definition Model
OSS (Hybrid): Each step either invokes a tool OR executes inline code
Premium (Action-Based): Adds conditional, parallel, approval action types

## Templating Syntax
Jinja2-style {{ }} with restricted features: variable access, nested access, filters (length, default, json). No arbitrary expressions (security).

## Input Declaration
Lightweight: - url, - timeout: 30
Full Schema: type, required, default, description, validation rules

## Output Declaration
Explicit declaration required (no auto-inference). Outputs create clear contracts for workflow composition.

## Step Dependencies
Implicit (Linear): Steps depend on previous step by default
Explicit Override: depends_on: [step_ids] for parallel/complex flows

## Context Object
Code blocks access: context.inputs, context.steps, context.config, context.execution_id

## Tool Schema Validation
Static values validated at parse time, templated values at runtime.

## Error Handling
OSS: Step-level on_error (skip|fail|retry), timeout, retry config
Premium: Advanced retry policies, retryable_errors filtering

## Complete Schema Structure
Metadata: name, version, description
Packages: profile (standard|common), additional
Defaults: timeout, on_error, python_exec settings
Inputs: lightweight or full schema syntax
Steps: id, tool/code, params, depends_on, on_error, timeout, when (Premium)
Outputs: from (step reference) or value (computed)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-009")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-009")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-009")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-009")
SORT decided_at DESC
```