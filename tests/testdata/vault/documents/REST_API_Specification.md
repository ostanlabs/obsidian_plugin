---
id: DOC-032
type: document
title: REST API Specification
workstream: engineering
status: Draft
created_at: 2025-12-22T12:58:38.446Z
updated_at: 2026-01-07T13:04:18.041Z
doc_type: spec
implemented_by: ["M-023"]
updated: 2026-01-15T23:49:04.205Z
---


HTTP REST API for management, execution, and introspection of AEL. Interface for humans, CI/CD pipelines, dashboards, programmatic access. Complements MCP interface (for agents).

## Dependencies
Workflow Registry, Workflow Engine, Tool Registry, Tool Invoker, Telemetry Store, Config Loader, Error Registry, Logger

## Technology Stack
- Framework: FastAPI (async, OpenAPI auto-generation, Pydantic)
- Server: Uvicorn (ASGI)
- Validation: Pydantic v2

## RESTConfig
host (0.0.0.0), port (8080), prefix (/api/v1), title, version, docs_enabled, docs_path, redoc_path, openapi_path, require_auth, api_keys, rate_limiting_enabled, requests_per_minute, cors_enabled, cors_origins

## Endpoints

### Workflow Endpoints
- GET /workflows - List all workflows
- GET /workflows/{name} - Get workflow by name
- POST /workflows - Register workflow (Premium)
- PUT /workflows/{name} - Update workflow (Premium)
- DELETE /workflows/{name} - Unregister workflow (Premium)
- POST /workflows/validate - Validate YAML

### Execution Endpoints
- POST /workflows/{name}/run - Execute workflow (sync)
- POST /workflows/{name}/start - Execute workflow (async, Premium)
- GET /executions/{id} - Get execution status
- GET /executions/{id}/logs - Get execution logs
- POST /executions/{id}/cancel - Cancel execution (Premium)

### Tool Endpoints
- GET /tools - List all tools
- GET /tools/{name} - Get tool details
- POST /tools/{name}/call - Direct tool call
- POST /tools/refresh - Refresh tool registry

### Health Endpoints
- GET /health - Health check
- GET /health/ready - Readiness check
- GET /health/live - Liveness check

## Error Response Model
Standard error response: {error: {code, message, details, retryable}}

## Authentication (OSS)
Optional API key authentication. Configured via api_keys list with name, key, scopes (read, write, execute).

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-032")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-032")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-032")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-032")
SORT decided_at DESC
```