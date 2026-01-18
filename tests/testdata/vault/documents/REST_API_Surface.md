---
id: DOC-014
type: document
title: REST API Surface
workstream: engineering
status: Draft
created_at: "2025-12-22T07:18:24.839Z"
updated_at: "2026-01-07T13:04:18.042Z"
doc_type: spec
implemented_by: ["M-023"]
updated: 2026-01-16T20:56:23.975Z
---


The REST API Surface defines HTTP endpoints for AEL management and execution, complementing the MCP protocol interface.

## REST API Execution Model
Synchronous (MVP): POST /api/v1/workflows/{name}/execute returns result directly
Async (Future): Returns execution_id, poll for result or webhook callback

## Core Endpoints

### Workflow Endpoints
- GET /api/v1/workflows - List registered workflows
- GET /api/v1/workflows/{name} - Get workflow details
- POST /api/v1/workflows/{name}/execute - Execute workflow
- POST /api/v1/workflows/{name}/validate - Validate workflow
- POST /api/v1/workflows - Register workflow (Premium)
- PUT /api/v1/workflows/{name} - Update workflow (Premium)
- DELETE /api/v1/workflows/{name} - Remove workflow (Premium)

### Tool Endpoints
- GET /api/v1/tools - List available tools
- GET /api/v1/tools/{name} - Get tool details
- POST /api/v1/tools/{name}/call - Direct tool call
- POST /api/v1/tools/refresh - Refresh tool schemas
- GET /api/v1/tools/health - Tool health status

### Execution Endpoints (Premium)
- GET /api/v1/executions - List executions
- GET /api/v1/executions/{id} - Get execution details
- GET /api/v1/executions/{id}/traces - Get execution traces

## Execution History Storage
OSS: In-memory or SQLite (local)
Premium: PostgreSQL (persistent, queryable)

## Webhook Callbacks (Future)
POST to configured URL on workflow completion with execution result.

## API Versioning Strategy
URL path versioning: /api/v1/...
Backward compatible within major version. Breaking changes = new version.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-014")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-014")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-014")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-014")
SORT decided_at DESC
```