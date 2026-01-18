---
id: DOC-021
type: document
title: MCP Frontend Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:34:06.722Z"
updated_at: "2026-01-14T04:34:58.294Z"
doc_type: spec
implemented_by: [M-013]
documents: [F-001]
---



MCP server implementation that exposes AEL's tools and workflows to LLM agents. Handles MCP protocol messages and routes to appropriate handlers.

## Dependencies
- Tool Registry (list/get tools)
- Workflow Registry (list/get workflows)
- Workflow Engine (execute workflows)
- Tool Invoker (direct tool calls)
- Logger

## MCP Primitives Exposed
- tools/list: List all available tools (native + workflows)
- tools/call: Execute a tool or workflow
- Future: resources/list, resources/read for workflow definitions

## Key Classes

### MCPFrontend
Main MCP server class using FastMCP library.
- _handle_list_tools() - Returns combined native tools + workflow tools
- _handle_call_tool(name, arguments) - Routes to tool invoker or workflow engine

### Tool Exposure
Native tools: Exposed directly from Tool Registry
Workflows: Exposed with workflow: prefix (e.g., workflow:scrape-and-publish)

## Transport
- stdio (Primary): For local development, subprocess model
- HTTP/SSE (Future): For remote connections

## Error Handling
AEL errors mapped to MCP error responses with isError: true, structured error in content.

## Implementation
Library: FastMCP (Python)
Entry point: MCPFrontend.run() for stdio transport
Configuration: From AELConfig.mcp section

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-021")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-021")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-021")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-021")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-021")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-021")
SORT decided_at DESC
```