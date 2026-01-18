---
id: DOC-011
type: document
title: MCP Protocol Integration
workstream: engineering
status: Draft
created_at: "2025-12-22T07:14:32.682Z"
updated_at: "2026-01-07T13:04:18.033Z"
doc_type: spec
implemented_by: [M-006]
updated: 2026-01-12T03:49:11.354Z
---


MCP Protocol Integration defines how AEL exposes itself to LLM agents. AEL acts as an MCP server, exposing tools (including workflows) that agents can discover and invoke.

## Architecture
LLM Agent → MCP Protocol (stdio/HTTP) → AEL (MCP Server) → Tool Registry + Workflow Engine → Backend MCP servers and HTTP endpoints

## MCP Primitives Exposed
MVP: Tools only (tools/list, tools/call)
Future: Tools + Resources (workflow definitions, tool docs, execution traces)
Not Planned: Prompts (agents bring their own)

## Tool Exposure Model
Individual Tools (Passthrough): All tools from registry exposed directly with name, description, inputSchema, outputSchema
Workflows as Tools: Exposed with workflow: prefix (e.g., workflow:scrape-and-publish)

## Tool Passthrough
When agent calls a tool, AEL routes to backend (MCP/HTTP) and returns result. No workflow execution for individual tool calls.

## MCP Transport Support
stdio (Primary): Default for local development, subprocess model
HTTP/SSE (Secondary): For remote connections, cloud deployment

## Session Handling
Stateless (MVP): Each request independent, no session state
Future: Optional session context for multi-step operations

## Authentication Model
OSS: No auth (local trust model) or simple API key
Premium: JWT tokens, per-tenant scoping, delegation support

## outputSchema Handling
If tool provides outputSchema: Pass through to agent
If tool doesn't: Omit field (MCP allows this)
Workflows: Generate from declared outputs

## Execution Telemetry Exposure
Execution traces exposed via MCP Resources (Premium) for debugging and observability

## Sync vs Async Execution
MVP: Synchronous only (request-response)
Future: Async execution ID for long-running workflows

## Error Handling
AEL errors mapped to MCP error codes with structured error content including code, message, details, retryable flag

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-011")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-011")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-011")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-011")
SORT decided_at DESC
```