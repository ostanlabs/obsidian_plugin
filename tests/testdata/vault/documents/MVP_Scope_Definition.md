---
id: DOC-039
type: document
title: MVP Scope Definition
workstream: engineering
status: Draft
created_at: "2025-12-22T13:09:07.761Z"
updated_at: "2026-01-07T13:04:18.034Z"
doc_type: spec
implemented_by: ["M-028"]
updated: 2026-01-16T20:56:24.013Z
---


Authoritative scope reference for AEL MVP. Status: COMPLETE - Delivered 2024-12-15.

## Guiding Principles
1. Developer can run a workflow locally (core value prop)
2. Agent can call AEL as MCP server (integration path)
3. No external dependencies (no database, no external services)
4. Reuse over build (leverage agent framework)
5. Defer complexity (Premium features come later)

## MVP IN ✅

### Workflow Engine
Linear execution, branching (on_error:skip), tool steps, code steps, templating, input validation, step/workflow timeout, simple retry, context object

### Workflow Schema
YAML format, lightweight/full input syntax, explicit outputs, implicit/explicit dependencies, workflow defaults, packages declaration

### Tool Registry
Config-based registration, MCP server tools, stdio transport, system tools (python_exec), in-memory cache, schema refresh

### Workflow Registry
Directory-based loading, in-memory storage, hot-reload, validation on load

### Python Exec Sandbox
Reuse CodeExecutionSandbox, standard/common package tiers, 7-layer security, implicit/explicit modes

### MCP Frontend
stdio transport, tools/list, tools/call, workflow: prefix, sync execution, error responses

### CLI
ael serve, ael run, ael workflows list (validate/show/tools deferred)

### Configuration
YAML config, file resolution, env var substitution, hot-reload, layered precedence, validation

### Error Handling
Error registry (~18 types), 5 categories, structured errors, matchers, retryable flag, error chain

### Logging
Colored hierarchical output, JSON format, component toggles, log levels, execution summary

## MVP OUT ❌

### Deferred to Post-MVP (OSS)
REST API, HTTP transport, plugins, telemetry persistence, SQLite, OTLP export, parallel execution, workflow composition, extended packages

### Premium Only
Pattern mining, workflow synthesis, composition, policy engine, multi-tenancy, cost accounting, custom errors, BYO containers

## Final Status
**MVP COMPLETE** - 118 integration tests passing, CI/CD operational, all 13 components delivered.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-039")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-039")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-039")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-039")
SORT decided_at DESC
```