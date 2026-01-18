---
id: DOC-010
type: document
title: Tool Registry
workstream: engineering
status: Draft
created_at: "2025-12-22T07:12:48.337Z"
updated_at: "2026-01-07T13:04:18.049Z"
doc_type: spec
implemented_by: [M-007]
updated: 2026-01-12T03:49:11.352Z
---


The Tool Registry is the central catalog of all tools available to AEL. It stores tool metadata, schemas, and source configurations.

## Tool Sources
- MCP Servers (Primary): Native tools, external MCP servers, stdio or HTTP transport
- HTTP Endpoints (Secondary): REST APIs wrapped as tools, OpenAPI definitions
- System Tools (Built-in): python_exec (always available)
- Virtual Tools (Premium Only): Workflows published as tools

## Tool Metadata Model
OSS Fields: name, description, input_schema (JSON Schema), output_schema, source (type/server/transport), enabled, available, last_seen
Premium Fields: version (virtual tools), operational metadata (latency, success_rate, cost), enrichment (use cases, paired tools), governance (owner, approved)

## Registration Model
Configuration-based (Primary): ael-config.yaml defines mcp_servers, http_tools, system_tools
Auto-refresh: File watcher detects config changes, reloads, refreshes schemas
API-based (Premium): POST /api/v1/tools for dynamic registration

## Tool Discovery
OSS MVP: ael tools list (name, type, server, status, description)
OSS Future: filters (--type, --status, --filter)
Premium: Semantic search based on embeddings

## Tool Versioning
MCP/HTTP/System tools: Not versioned
Virtual tools (Premium): Semver versioned

## Schema Storage
OSS: In-memory cache (reloaded from config on restart)
Premium: PostgreSQL (persistent)

## Tool Unavailability Handling
At Startup: Mark unavailable, log warning, continue
At Registration: OSS=warn, Premium=configurable (warn/block/require approval)
At Execution: Respects on_error setting (fail/skip)

## Registry Operations
OSS: list, describe, refresh, health
Premium: + register, update, remove, search, stats, per-server refresh

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-010")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-010")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-010")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-010")
SORT decided_at DESC
```