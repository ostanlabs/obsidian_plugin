---
id: DOC-022
type: document
title: MCP Client Manager Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:35:04.133Z"
updated_at: "2026-01-07T13:04:18.031Z"
doc_type: spec
implemented_by: ["S-035"]
updated: 2026-01-17T18:14:41.423Z
---


Manages connections to backend MCP servers. Handles tool discovery, invocation, and connection lifecycle.

## Dependencies
- Config Loader (server configurations)
- Error Registry (connection/invocation errors)
- Logger

## Key Classes

### MCPServerConnection
Represents a connection to a single MCP server.
- server_name, config, connected, tools[], last_error
- connect() - Establish connection
- disconnect() - Close connection
- list_tools() - Get available tools
- call_tool(name, arguments) - Invoke tool

### MCPClientManager
Manages multiple MCP server connections.
- connections{} - Map of server_name to MCPServerConnection
- connect_all() - Connect to all configured servers
- disconnect_all() - Disconnect all servers
- get_all_tools() - Aggregate tools from all servers
- call_tool(server_name, tool_name, arguments) - Route to specific server

## Transport Support
- stdio (MVP): Subprocess-based, command + args from config
- HTTP/SSE (Future): URL-based connection

## Connection Lifecycle
1. Load server configs from ael-config.yaml
2. Connect to each server on startup
3. Fetch tool lists (tools/list)
4. Maintain connections for tool calls
5. Reconnect on failure (configurable retry)

## Error Handling
- Connection failures: Mark server unavailable, log error
- Tool call failures: Propagate as TOOL_FAILED/TOOL_TIMEOUT
- Retry logic: Configurable per-server

## Configuration
mcp_servers section in ael-config.yaml with command, args, env, timeout per server.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-022")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-022")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-022")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-022")
SORT decided_at DESC
```