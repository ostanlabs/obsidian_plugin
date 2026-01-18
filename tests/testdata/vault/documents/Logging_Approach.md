---
id: DOC-007
type: document
title: Logging Approach
workstream: engineering
status: Draft
created_at: "2025-12-22T07:10:25.825Z"
updated_at: "2026-01-07T13:04:18.031Z"
doc_type: spec
implemented_by: [M-003]
---


AEL preserves agent-like hierarchical colored logging for developer experience. Logs clearly show component separation with indentation and color coding. JSON format available for production.

## Design Principles
1. Readable by default - Colored, hierarchical output for development
2. Structured for production - JSON format for log aggregation
3. Clear component separation - Visual distinction between workflow, step, tool, sandbox
4. Minimal noise - Only relevant information at each level

## Logger Components
- WorkflowLogger: Workflow start/end (Blue/Cyan)
- StepLogger: Step execution (Green/Yellow)
- ToolLogger: MCP/HTTP calls (Magenta/White)
- SandboxLogger: Python exec (Gray)
- PolicyLogger: Policy checks (Red/Orange) - Premium only

## Output Formats
Colored (Development): Default for CLI, human-readable with visual hierarchy
JSON (Production): Structured logs for aggregation (ELK, Datadog) with timestamp, level, component, execution_id, workflow, step_id, event, duration, success, tool

## Configuration
Level: DEBUG, INFO, WARN, ERROR
Format: colored | json
Components: workflow, step, tool, sandbox, policy (toggleable)
Options: indentation, show_params, show_results, truncate_at, timestamps

## Colored Metrics Summary
At workflow completion: Execution report with workflow info, step breakdown (step, tool, duration, status), tool usage summary (calls, avg duration)

## Security Considerations
Development: show_params=true, show_results=true, level=DEBUG
Production: show_params=false (secrets), show_results=false (PII), level=INFO/WARN

## Inheritance
Based on existing agent framework's ToolsLogger and colored_metrics.py patterns.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-007")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-007")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-007")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-007")
SORT decided_at DESC
```