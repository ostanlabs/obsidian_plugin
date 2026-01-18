---
id: DOC-038
type: document
title: Test Fixtures
workstream: engineering
status: Draft
created_at: "2025-12-22T13:08:43.849Z"
updated_at: "2026-01-07T13:04:18.046Z"
doc_type: spec
implemented_by: [M-026]
updated: 2026-01-15T23:48:49.142Z
---


Test fixtures for AEL integration testing. Sample workflows, configs, and mock data.

## Valid Test Workflows

### simple-linear.yaml
Two-step workflow: http_request tool → code extraction
Inputs: url
Outputs: status, length

### code-step.yaml
Workflow with inline code execution only
Inputs: numbers (JSON array)
Steps: parse_input → calculate_sum → format_output
Outputs: sum, details

### dependencies.yaml
Workflow with explicit depends_on relationships
Steps: step_a → step_b → step_c (chain)
Tests dependency ordering

### tool-and-code.yaml
Mixed workflow: tool step + code step
Tests both execution modes

### error-handling.yaml
Workflow with on_error configurations
Tests fail, skip, retry behaviors

## Invalid Test Workflows

### missing-name.yaml
Workflow without required name field

### circular-deps.yaml
Workflow with circular depends_on (should fail validation)

### invalid-template.yaml
Workflow with malformed {{ }} templates

### unknown-tool.yaml
Workflow referencing non-existent tool

## Mock MCP Server Fixtures

### mock_tools.json
Tool definitions for mock server: http_request, echo, fail_tool

### mock_responses.json
Predefined responses for test scenarios

## Config Fixtures

### minimal-config.yaml
Minimal valid configuration

### full-config.yaml
Configuration with all options set

### invalid-configs/
Directory of invalid configs for error testing

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-038")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-038")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-038")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-038")
SORT decided_at DESC
```