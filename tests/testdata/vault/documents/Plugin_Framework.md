---
id: DOC-005
type: document
title: Plugin Framework
workstream: engineering
status: Draft
created_at: "2025-12-22T07:09:18.104Z"
updated_at: "2026-01-07T13:04:18.036Z"
doc_type: spec
implemented_by: [M-024]
updated: 2026-01-17T07:16:05.720Z
---


The Plugin Framework provides extension points within AEL execution. OSS plugins can observe and transform data. Premium plugins can additionally control execution flow (skip, abort, retry, wait).

## Key Clarification
Plugin Framework ≠ SDK. SDK is client library to CALL AEL (for agent developers). Plugin Framework is extension points INSIDE AEL (for platform operators).

## Hook Points
1. REQUEST_RECEIVED - Workflow execution starts (auth, input validation, logging)
2. STEP_BEFORE_EXEC - Before each step (transform params, log, metrics)
3. STEP_AFTER_EXEC - After each step (transform results, log, metrics)
4. RESPONSE_READY - Before returning (final transforms, logging)

## OSS vs Premium Capabilities
OSS Plugins (Observability Focus): Read data, transform data, add metadata, log/emit metrics/telemetry. Cannot skip/abort/retry/wait.
Premium Plugins (Control Flow): All OSS capabilities plus skip steps, abort workflow, retry steps, wait for approval.

## Plugin Loading Mechanisms
1. Built-in: Ships with AEL (logging, metrics)
2. File-based: Local Python file (./plugins/my_transform.py)
3. Package-based: Installed pip package (ael_plugin_datadog)

## Built-in Plugins
OSS: logging, metrics, request-transform, response-transform, tracing
Premium: policy (Cedar/Rego), approval, retry, circuit-breaker

## Plugin Execution Order
Plugins execute in priority order (lower number = earlier). Auth=10, logging=50, metrics=90.

## Error Handling
- fail_open: true - Plugin errors logged but don't stop workflow (default for observability)
- fail_open: false - Plugin errors abort workflow

## Data Available
All hooks receive execution context (execution_id, workflow version, timestamp, metadata) plus hook-specific data.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-005")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-005")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-005")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-005")
SORT decided_at DESC
```