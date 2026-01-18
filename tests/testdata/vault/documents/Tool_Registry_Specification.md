---
id: DOC-020
type: document
title: Tool Registry Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:33:17.548Z"
updated_at: "2026-01-07T13:04:18.049Z"
doc_type: spec
implemented_by: [M-007]
updated: 2026-01-12T03:49:11.366Z
---


Central catalog of all tools available to AEL. Aggregates tools from MCP servers and system tools. Provides discovery, schema access, and routing information.

## Dependencies
- Shared Types (ToolSource, ToolStatus)
- MCP Client Manager (fetch tools from MCP servers)
- Config Loader (tool configuration)
- Error Registry, Logger

## Key Data Structures

### ToolDefinition
name, description, source (ToolSource), server_name, input_schema, output_schema, status (ToolStatus), last_seen, error
Method: to_mcp_tool() - Convert to MCP tool format

### ToolRegistryStats
total_tools, available_tools, unavailable_tools, by_source{}, by_server{}

## ToolRegistry Class

### Core Operations
- get_tool(name) → ToolDefinition | None
- list_tools(source_filter, status_filter) → List[ToolDefinition]
- get_stats() → ToolRegistryStats

### Refresh Operations
- refresh_all() - Refresh all tool sources
- refresh_server(server_name) - Refresh specific MCP server

### System Tools
- register_system_tool(tool) - Register built-in tool (python_exec)

## Tool Sources
- MCP Servers: Tools from configured MCP servers
- System Tools: Built-in tools (python_exec always available)
- HTTP Endpoints: Post-MVP

## Implementation Notes
- In-memory cache with configurable refresh
- Config-based registration from ael-config.yaml
- Tool status tracking (available/unavailable)
- Automatic refresh on config change

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-020")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-020")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-020")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-020")
SORT decided_at DESC
```