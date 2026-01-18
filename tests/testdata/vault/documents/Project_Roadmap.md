---
id: DOC-044
type: document
title: Project Roadmap
workstream: product
status: Draft
created_at: "2025-12-22T13:11:56.114Z"
updated_at: "2026-01-07T13:04:18.039Z"
doc_type: spec
implemented_by: ["M-027"]
updated: 2026-01-17T18:28:11.841Z
---


AEL development roadmap. Last Updated: 2025-12-16.

## Current Focus
1. Internal Validation (AEL + Agent) - Engineering - ACC-139
2. PR Campaign Launch - Business - ACC-130 to ACC-138
3. MVP Polish (deferred CLI commands) - Engineering

## Engineering Phases

### Phase 0: Internal Validation (Current)
Goal: Validate AEL works end-to-end with real MCP tools.
Tasks: Create internal/ael-config.yaml, example workflows (scrape-url, scrape-and-publish, file-operations, data-transform), test ael serve, configure Claude Desktop, end-to-end test.
Exit: Claude Desktop can call workflow:* tools, at least one workflow executes successfully.

### Phase 1: MVP Polish
Goal: Complete deferred items, prepare for external users.
Tasks: CLI commands (validate, workflows show, tools list/show/refresh, config show), align PythonExecSandbox API, README, Getting Started guide, example workflows.
Exit: All 14 skipped CLI tests passing, documentation complete.

### Phase 2: Repository & Plugin Framework
Goal: OSS repo public, plugin system working, premium repo structure.
Tasks: Apache 2.0 license, CONTRIBUTING.md, AELPlugin base class, hooks in workflow engine, premium repo with git dependency.
Spec: PLUGIN_FRAMEWORK_SPEC.md, Decisions DEC-059 to DEC-064.

### Phase 3: OSS Hardening
Goal: Production-ready for early adopters.
Tasks: HTTP transport (MCP server + client), REST API, telemetry persistence (SQLite), Prometheus metrics, health checks, rate limiting.
Specs: REST_API_SPEC.md, TELEMETRY_STORE_SPEC.md.

### Phase 4: Premium Foundation
Goal: Enable enterprise features - governance, compliance.
Tasks: Policy engine (Cedar/Rego), multi-tenancy, cost accounting, audit logging.

### Phase 5+: Premium Intelligence
Goal: Key differentiators - pattern mining, workflow synthesis.
Tasks: Telemetry analysis, pattern detection, LLM-assisted workflow generation.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-044")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-044")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-044")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-044")
SORT decided_at DESC
```