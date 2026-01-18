---
id: DOC-015
type: document
title: Telemetry Model
workstream: engineering
status: Draft
created_at: "2025-12-22T07:19:55.150Z"
updated_at: "2026-01-07T13:04:18.043Z"
doc_type: spec
implemented_by: [M-025]
updated: 2026-01-15T23:48:49.092Z
---


The Telemetry Model defines how AEL captures, stores, and exports execution data for observability and analysis.

## Telemetry Data Categories
- Execution traces: Step-by-step execution details
- Metrics: Duration, counts, success rates
- Logs: Structured log events

## Telemetry Data Storage
OSS: In-memory with JSON file export, local SQLite
Premium: PostgreSQL with long-term retention, redaction policies, query support

## OSS File Storage Format
JSON Lines (.jsonl) for streaming append and easy parsing.
One file per execution or rolling files by time.

## OpenTelemetry Export in OSS
Optional OTLP export to external collectors (Jaeger, Zipkin, etc.).
Configurable via telemetry.export settings.

## Code Block Telemetry
Capture for inline code execution: imports used, tool calls made, duration, stdout/stderr, exceptions.

## Direct Execution Telemetry
Capture for direct tool calls: tool name, parameters, result summary, duration, success/failure.

## Trace Structure
ExecutionTrace: execution_id, workflow, inputs, steps[], duration, success
StepTrace: step_id, tool_name, parameters, output, success, error, duration, timestamp

## Premium Telemetry Additions
- Long-term storage with retention policies
- PII redaction rules
- Query interface for analytics
- Pattern mining from telemetry data
- Cost attribution per execution

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-015")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-015")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-015")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-015")
SORT decided_at DESC
```