---
id: DOC-055
type: document
title: HTTP Transport Specification
workstream: engineering
status: Draft
created_at: "2026-01-15T02:31:01.481Z"
updated_at: "2026-01-15T02:31:46.178Z"
doc_type: spec
implemented_by: [S-073]
previous_version: []
updated: 2026-01-17T07:16:05.760Z
---

HTTP transport implementation for MCP Frontend, enabling remote agent connections via Streamable HTTP (primary) and Legacy HTTP+SSE (backwards compatibility).

## Overview

Extends MCP Frontend (DOC-021) with HTTP transport capabilities. Runs on dedicated port 8082, separate from REST API (8080) and Python Exec (8081).

## Protocol Compliance

Implements MCP Specification v2025-06-18 transport requirements:
- **Streamable HTTP**: Single `/mcp` endpoint supporting POST and GET
- **Legacy HTTP+SSE**: Dual endpoints (`/sse` GET, `/messages` POST) for older clients

## Architecture

```
MCP Frontend (DOC-021)
├── Transport Layer (NEW)
│   ├── StdioTransport (existing, refactored)
│   └── HTTPTransport
│       ├── StreamableHTTPHandler
│       ├── LegacySSEHandler
│       └── SessionManager
└── Protocol Handler (existing)
    ├── _handle_list_tools()
    └── _handle_call_tool()
```

## Endpoints

### Streamable HTTP (Primary)

| Method | Path | Purpose |
|--------|------|----------|
| POST | `/mcp` | Send JSON-RPC request/notification/response |
| GET | `/mcp` | Open SSE stream for server-initiated messages |
| DELETE | `/mcp` | Terminate session (optional) |

### Legacy HTTP+SSE (Backwards Compatibility)

| Method | Path | Purpose |
|--------|------|----------|
| GET | `/sse` | Open SSE stream, receive `endpoint` event |
| POST | `/messages?sessionId=X` | Send JSON-RPC messages |

## Request/Response Flow

### Streamable HTTP POST

1. Client POSTs JSON-RPC message to `/mcp`
2. Headers required:
   - `Content-Type: application/json`
   - `Accept: application/json, text/event-stream`
   - `MCP-Protocol-Version: 2025-06-18` (after init)
   - `Mcp-Session-Id: <id>` (if session established)
3. Server responds with:
   - `Content-Type: application/json` for simple responses, OR
   - `Content-Type: text/event-stream` for streaming responses

### SSE Event Format

```
event: message
id: <unique-event-id>
data: {"jsonrpc": "2.0", ...}

```

## Session Management

Stateful sessions enabled by default.

### Session Lifecycle

1. Client sends `InitializeRequest` (no session ID)
2. Server responds with `InitializeResult` + `Mcp-Session-Id` header
3. Client includes `Mcp-Session-Id` in all subsequent requests
4. Session terminates on:
   - Client DELETE to `/mcp`
   - Server timeout (configurable, default 30 minutes)
   - Server restart

### Session Storage

In-memory session store (MVP). Premium: Redis/PostgreSQL for distributed sessions.

```python
@dataclass
class MCPSession:
    session_id: str
    created_at: datetime
    last_activity: datetime
    client_info: dict  # From InitializeRequest
    sse_connections: List[SSEConnection]  # Active SSE streams
```

## Authentication

Optional API key authentication (OSS).

### Configuration

```yaml
http:
  auth:
    enabled: false  # Default: no auth
    api_keys:
      - name: "dev-key"
        key: "ael_dev_xxxxx"
        scopes: ["tools:read", "tools:call"]
```

### Header Format

```
Authorization: Bearer ael_xxxxx
```

### Scopes

| Scope | Permission |
|-------|------------|
| `tools:read` | List tools, get tool info |
| `tools:call` | Execute tools/workflows |
| `*` | All permissions |

## Security Requirements

Per MCP Specification:

1. **Origin Validation**: MUST validate `Origin` header on all requests
2. **Localhost Binding**: SHOULD bind to `127.0.0.1` by default (not `0.0.0.0`)
3. **DNS Rebinding Protection**: Reject requests with suspicious origins

### Allowed Origins Configuration

```yaml
http:
  security:
    allowed_origins:
      - "http://localhost:*"
      - "https://claude.ai"
    bind_host: "127.0.0.1"  # Default localhost
```

## TLS Configuration

No TLS by default (reverse proxy model).

```yaml
http:
  tls:
    enabled: false  # Default
    # Future: cert_path, key_path for Option B
```

Production deployments should use reverse proxy (nginx, Traefik) for TLS termination.

## Connection Limits

Configurable with sensible defaults.

```yaml
http:
  limits:
    max_connections: 100        # Total concurrent connections
    max_sessions: 50            # Active sessions
    max_sse_per_session: 5      # SSE streams per session
    request_timeout: 300        # Seconds
    session_timeout: 1800       # 30 minutes
```

## Configuration Schema

Full `ael-config.yaml` section:

```yaml
http:
  enabled: false              # Disabled by default (stdio primary)
  host: "127.0.0.1"
  port: 8082
  
  # Transport modes
  transports:
    streamable_http: true     # Primary (v2025-06-18)
    legacy_sse: true          # Backwards compat (v2024-11-05)
  
  # Authentication
  auth:
    enabled: false
    api_keys: []
  
  # Security
  security:
    validate_origin: true
    allowed_origins: ["http://localhost:*"]
    bind_host: "127.0.0.1"
  
  # TLS
  tls:
    enabled: false
  
  # Limits
  limits:
    max_connections: 100
    max_sessions: 50
    max_sse_per_session: 5
    request_timeout: 300
    session_timeout: 1800
```

## CLI Integration

```bash
# Start with HTTP transport
ael serve --transport http --port 8082

# Start with both transports
ael serve --transport stdio --transport http --http-port 8082

# HTTP only with custom config
ael serve --transport http --config ./ael-config.yaml
```

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|--------|
| 200 | Success (JSON response) |
| 202 | Accepted (notification/response received) |
| 400 | Bad Request (invalid JSON-RPC) |
| 401 | Unauthorized (missing/invalid API key) |
| 403 | Forbidden (insufficient scope) |
| 404 | Not Found (invalid session) |
| 405 | Method Not Allowed |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

### JSON-RPC Error Response

```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": {"detail": "Missing required field: method"}
  }
}
```

## Implementation Stack

- **Framework**: FastAPI (async, OpenAPI generation)
- **SSE**: `sse-starlette` package
- **Async**: `anyio` for transport compatibility
- **Validation**: Pydantic v2

## File Structure

```
src/ael/mcp_frontend/
├── __init__.py
├── frontend.py              # MCPFrontend class
├── protocol.py              # JSON-RPC handling
└── transports/
    ├── __init__.py
    ├── base.py              # Abstract Transport
    ├── stdio.py             # StdioTransport
    └── http/
        ├── __init__.py
        ├── server.py        # FastAPI app
        ├── streamable.py    # Streamable HTTP
        ├── legacy_sse.py    # Legacy SSE
        ├── session.py       # Session manager
        └── auth.py          # API key auth
```

## Dependencies

- MCP Frontend (DOC-021) - Protocol handling
- Config Loader - HTTP configuration
- Error Registry - Error normalization
- Logger - Request/response logging

## Related Documents

- DOC-021: MCP Frontend Specification
- DOC-032: REST API Specification (separate port)
- DOC-018: CLI Specification (--transport flag)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-055")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-055")
SORT decided_at DESC
```