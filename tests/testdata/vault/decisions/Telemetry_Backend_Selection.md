---
id: DEC-065
type: decision
title: Telemetry Backend Selection
workstream: engineering
status: Decided
created_at: "2026-01-14T18:41:14.875Z"
updated_at: "2026-01-14T22:22:14.524Z"
blocks: ["DEC-066"]
updated: 2026-01-16T22:24:23.127Z
---

## Context

AEL needs telemetry to track workflow executions, tool invocations, latencies, and errors. This decision determines the underlying telemetry collection and storage backend.

## Decision

Option D: OpenTelemetry SDK with Prometheus exporter. Instrument once with OTEL SDK for all three signals (metrics, traces, logs), but initially only export metrics to Prometheus. Phase 2 adds OTLP exporters for Tempo (traces) and Loki (logs) with zero re-instrumentation.

## Rationale

OTEL SDK provides future-proof instrumentation. Initial complexity is minimal (~10 extra lines vs prometheus-client), but eliminates rework when adding traces/logs in Phase 2. Context propagation for distributed tracing is built-in from day one.

## 🔗 Enabled Entities

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
WHERE contains(file.frontmatter.depends_on, "DEC-065") OR contains(file.frontmatter.enabled_by, "DEC-065")
SORT type ASC, title ASC
```

## 📄 Affected Documents

```dataview
TABLE title as "Document", version as "Version"
FROM "documents"
WHERE contains(this.affects_documents, id)
SORT title ASC
```