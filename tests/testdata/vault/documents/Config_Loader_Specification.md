---
id: DOC-023
type: document
title: Config Loader Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:37:12.052Z"
updated_at: "2026-01-07T13:04:18.015Z"
doc_type: spec
implemented_by: [M-005]
updated: 2026-01-17T07:16:05.735Z
---


Loads and validates AEL configuration from YAML files. Supports layered configuration with precedence rules and hot-reload.

## Dependencies
- Error Registry (configuration errors)
- Logger

## Configuration Search Order
1. --config flag (CLI argument)
2. ./ael-config.yaml (current directory)
3. ~/.ael/config.yaml (user home)
4. /etc/ael/config.yaml (system)

## Key Classes

### AELConfig (Dataclass)
Complete configuration structure: server, tools (mcp_servers, system_tools), execution (defaults), plugins, logging, telemetry, premium

### ConfigLoader
- load(path?) → AELConfig: Load and validate config
- reload() → AELConfig: Reload from current path
- watch(callback): Start file watcher for hot-reload

## Validation
- JSON Schema validation for structure
- Strict mode: Unknown keys = error (catch typos)
- Type validation for all fields
- Required field checking

## Hot Reload
- File watcher detects changes
- Validates new config before applying
- Invalid config: Reject and log error, keep running
- Atomic application of new config

## Environment Variable Expansion
Supports ${VAR} syntax in config values for secrets and environment-specific settings.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-023")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-023")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-023")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-023")
SORT decided_at DESC
```