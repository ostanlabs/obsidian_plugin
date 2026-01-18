---
id: DOC-013
type: document
title: Configuration Model
workstream: engineering
status: Draft
created_at: "2025-12-22T07:17:02.322Z"
updated_at: "2026-01-07T13:04:18.017Z"
doc_type: spec
implemented_by: [M-005]
updated: 2026-01-17T07:16:05.723Z
---


AEL configuration follows a layered model with clear precedence rules. Higher layers override lower layers with merge semantics.

## Configuration Layers (highest to lowest priority)
1. Step-Level: Per-step in workflow YAML (timeout, on_error, retry, tool params)
2. Workflow-Level: defaults: block in workflow YAML
3. System Config: ael-config.yaml (server settings, tool registry, plugins)
4. Hardcoded Defaults: Built into AEL codebase

## Precedence Rule
Higher layer wins. More specific wins. Merge semantics apply (override only what you specify, inherit the rest).

## Configuration File Format
YAML (MVP): ael-config.yaml, workflow.yaml
JSON (Future): ael-config.json for programmatic generation

## Configuration File Location
Search order: --config flag, ./ael-config.yaml, ~/.ael/config.yaml, /etc/ael/config.yaml

## Hot Reload
File watcher detects changes, validates new config, applies atomically. Invalid config: reject and log error, keep running.

## Configuration Sections
server: host, port, cors
tools: mcp_servers, http_tools, system_tools
execution: defaults for timeout, retry, on_error
plugins: list of enabled plugins
logging: level, format, output
telemetry: enabled, export settings
premium: license, tenant settings

## Validation
Strict mode (MVP): Unknown keys = error (catch typos)
Future: Configurable strictness
Type validation against JSON Schema

## Workflow Config Override via Tool Call
Tool call cannot override timeout/retry dynamically (MVP). Static config only for security and predictability.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-013")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-013")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-013")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-013")
SORT decided_at DESC
```