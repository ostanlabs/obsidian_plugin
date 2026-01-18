---
id: DOC-058
type: document
title: "Phase 2.4 Specification: Basic Observability"
workstream: engineering
status: Draft
created_at: "2026-01-15T03:50:24.727Z"
updated_at: "2026-01-15T03:53:05.726Z"
doc_type: spec
implemented_by: [M-025]
previous_version: []
---

Comprehensive specification for M-025: Basic observability stack for AEL using OpenTelemetry, Prometheus, Grafana, Loki, and Tempo.

## Overview

This phase implements production-grade observability:
1. **Metrics** - OTEL SDK with Prometheus export
2. **Dashboards** - Grafana for visualization
3. **Logs** - Loki for log aggregation
4. **Traces** - Tempo for distributed tracing
5. **Correlation** - OTEL Collector for unified pipeline

## Milestone: M-025

**Total Effort**: ~2-3 weeks
**Stories**: 5
**Tasks**: 27

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           AEL                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Metrics   │  │    Logs     │  │   Traces    │             │
│  │  (Counter,  │  │ (Structured │  │   (Spans)   │             │
│  │  Histogram) │  │    JSON)    │  │             │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         │     OTLP       │     OTLP       │                     │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OTEL Collector                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Receivers: otlp │ Processors: batch │ Exporters: multi  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────┬────────────────┬────────────────┬─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Prometheus  │  │     Loki     │  │    Tempo     │
│   (metrics)  │  │    (logs)    │  │   (traces)   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                         ▼
               ┌──────────────────┐
               │     Grafana      │
               │   (dashboards)   │
               └──────────────────┘
```

---

## Story 1: Basic Metrics Implementation (S-072)

**Effort**: ~4-5 days
**Tasks**: 7

### Metrics Schema

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ael_workflow_executions_total` | Counter | workflow, status | Total executions |
| `ael_workflow_duration_seconds` | Histogram | workflow | Execution duration |
| `ael_tool_invocations_total` | Counter | tool, status | Tool call count |
| `ael_tool_duration_seconds` | Histogram | tool | Tool call duration |
| `ael_step_executions_total` | Counter | workflow, step, type | Step executions |
| `ael_active_workflows` | Gauge | - | Currently running |
| `ael_errors_total` | Counter | type, component | Error count |

### Configuration

```yaml
telemetry:
  enabled: true
  metrics:
    enabled: true
    endpoint: "/metrics"    # Prometheus scrape endpoint
    port: 9090              # Metrics port (separate from MCP)
  exporters:
    otlp:
      endpoint: "http://otel-collector:4317"
      insecure: true
```

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T-164 | Add opentelemetry-* packages to pyproject.toml | S |
| T-110 | Define AEL core metrics schema (OTEL conventions) | M |
| T-111 | Instrument workflow execution with OTEL SDK | M |
| T-112 | Add OTEL metrics and spans for tool invocations | M |
| T-113 | Configure OTEL PrometheusMetricReader for /metrics | S |
| T-114 | Add OTEL telemetry configuration to ael-config.yaml | S |
| T-115 | Write tests for metrics collection | M |

---

## Story 2: Grafana Dashboard Implementation (S-076)

**Effort**: ~3-4 days
**Tasks**: 7

### Dashboard Structure

1. **AEL Overview Dashboard**
   - Total workflows executed (24h)
   - Success rate gauge
   - Active workflows
   - Error rate trend

2. **Workflow Execution Dashboard**
   - Execution duration histogram
   - Per-workflow success rate
   - Step breakdown
   - Recent failures table

3. **Tool Invocation Dashboard**
   - Tool call frequency
   - Latency percentiles (p50, p95, p99)
   - Error rate by tool
   - Slowest tools table

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T-116 | Deploy Grafana to homelab | S |
| T-117 | Configure Prometheus data source in Grafana | S |
| T-118 | Create AEL Overview dashboard | M |
| T-119 | Create Workflow Execution dashboard | M |
| T-120 | Create Tool Invocation dashboard | M |
| T-121 | Configure basic alerting rules | S |
| T-122 | Export dashboards as JSON for version control | S |

---

## Story 3: Loki for Log Aggregation (S-080)

**Effort**: ~2-3 days
**Tasks**: 4

### Log Format

AEL logs in JSON format for Loki ingestion:

```json
{
  "timestamp": "2026-01-15T10:30:00Z",
  "level": "INFO",
  "component": "workflow_engine",
  "workflow_id": "wf-123",
  "execution_id": "exec-456",
  "message": "Workflow started",
  "trace_id": "abc123",
  "span_id": "def456"
}
```

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T-143 | Deploy Loki to homelab | S |
| T-144 | Configure Loki data source in Grafana | S |
| T-145 | Configure AEL to ship logs to Loki | M |
| T-146 | Create log exploration dashboard in Grafana | M |

---

## Story 4: Tempo for Distributed Tracing (S-081)

**Effort**: ~2-3 days
**Tasks**: 4

### Trace Structure

```
Workflow Execution (root span)
├── Step 1: tool_call
│   └── MCP Request
├── Step 2: code_execution
│   └── Python Exec
└── Step 3: tool_call
    └── MCP Request
```

### Span Attributes

| Attribute | Description |
|-----------|-------------|
| `ael.workflow.name` | Workflow name |
| `ael.workflow.id` | Execution ID |
| `ael.step.name` | Step name |
| `ael.step.type` | tool_call, code, workflow |
| `ael.tool.name` | Tool being called |
| `ael.error.type` | Error classification |

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T-147 | Deploy Tempo to homelab | S |
| T-148 | Configure Tempo data source in Grafana | S |
| T-149 | Verify AEL trace spans propagate correctly | M |
| T-150 | Create trace exploration dashboard in Grafana | M |

---

## Story 5: OTEL Trace and Log Exporters (S-082)

**Effort**: ~2-3 days
**Tasks**: 5

### OTEL Collector Configuration

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"
  loki:
    endpoint: "http://loki:3100/loki/api/v1/push"
  otlp/tempo:
    endpoint: "tempo:4317"
    tls:
      insecure: true

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [loki]
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo]
```

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T-151 | Add OTLP trace exporter to AEL configuration | S |
| T-152 | Add OTLP log exporter to AEL configuration | S |
| T-153 | Deploy OTEL Collector to homelab | M |
| T-154 | Configure OTEL Collector pipelines | M |
| T-155 | Verify end-to-end trace correlation in Grafana | M |

---

## Dependencies

### Related Documents

- DOC-015: Telemetry Model
- DOC-033: Telemetry Store Specification
- DOC-007: Logging Approach

### Blocks

- M-026: Phase 3.1 Integration Testing
- M-040: Phase 5.1 Premium Foundation

---

## Deployment Architecture

### Docker Compose Addition

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana

  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"

  tempo:
    image: grafana/tempo:latest
    ports:
      - "3200:3200"
      - "4317:4317"  # OTLP gRPC

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    ports:
      - "4317:4317"  # OTLP gRPC
      - "4318:4318"  # OTLP HTTP
    volumes:
      - ./otel-config.yaml:/etc/otelcol/config.yaml
```

---

## Success Metrics

1. **Metrics**: Prometheus scraping AEL /metrics successfully
2. **Dashboards**: 3 Grafana dashboards showing live data
3. **Logs**: Loki receiving and indexing AEL logs
4. **Traces**: Tempo showing workflow execution spans
5. **Correlation**: Click from log → trace in Grafana works

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| High cardinality metrics | Medium | Limit labels, use exemplars |
| Trace volume | Low | Sample non-error traces |
| Storage growth | Medium | Retention policies |

---

## Related Documents

- DOC-015: Telemetry Model
- DOC-033: Telemetry Store Specification
- DOC-007: Logging Approach
- DOC-056: Docker Deployment Specification

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-058")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-058")
SORT decided_at DESC
```