---
id: F-019
type: feature
title: HTTP Transport
workstream: engineering
status: Planned
created_at: "2026-01-14T00:54:30.669Z"
updated_at: "2026-01-15T02:36:17.553Z"
user_story: []
tier: OSS
phase: "3"
implemented_by: [S-073]
updated: 2026-01-17T07:16:05.689Z
---

HTTP transport support for MCP Frontend, enabling remote agent connections without stdio subprocess constraints.

## Description

Allows LLM agents to connect to AEL over HTTP instead of requiring subprocess stdio transport. Implements both MCP Streamable HTTP (v2025-06-18) and Legacy HTTP+SSE (v2024-11-05) for maximum client compatibility.

## Key Capabilities

- Remote agent connections over HTTP
- Multiple concurrent client sessions
- API key authentication (optional)
- Origin validation for security
- Configurable connection limits

## Configuration

```yaml
http:
  enabled: true
  port: 8082
  auth:
    enabled: false
```

## Related

- DOC-055: HTTP Transport Specification
- DOC-021: MCP Frontend Specification
- S-073: HTTP/SSE Transport for MCP (implementation story)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "F-019")
SORT type ASC, title ASC
```

## 📄 Documentation

```dataview
TABLE title as "Document", doc_type as "Type", status as "Status"
FROM "documents"
WHERE contains(documents, "F-019")
SORT title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_on as "Date"
FROM "decisions"
WHERE contains(affects, "F-019")
SORT decided_on DESC
```