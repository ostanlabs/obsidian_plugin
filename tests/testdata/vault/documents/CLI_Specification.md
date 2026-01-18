---
id: DOC-018
type: document
title: CLI Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:31:40.300Z"
updated_at: "2026-01-07T13:04:17.999Z"
doc_type: spec
implemented_by: ["M-029","S-041"]
updated: 2026-01-17T18:14:41.422Z
---


Command-line interface for AEL. Provides commands to serve, run workflows, validate, and manage tools/workflows.

## Commands
- ael serve: Start AEL as MCP server (stdio transport)
- ael run <WORKFLOW>: Execute a workflow directly
- ael validate <FILE>: Validate a workflow file
- ael workflows list/show: Workflow management
- ael tools list/show/refresh: Tool management
- ael config show: Configuration display
- ael version: Show version information

## Global Options
-c, --config <PATH>: Config file path
-v, --verbose: Increase verbosity
-q, --quiet: Suppress output
--json: Output in JSON format

## Key Commands

### ael serve
Start AEL as MCP server. Options: --config, --no-watch (disable hot-reload)

### ael run
Execute workflow. Options: -i/--input KEY=VALUE, --input-file PATH, -t/--timeout, --json

### ael validate
Validate workflow file. Options: --strict (treat warnings as errors), --show-schema

### ael tools
Subcommands: list (--format table|json), show <NAME> (--schema), refresh (--server NAME)

### ael workflows
Subcommands: list (--format table|json), show <NAME> (--yaml)

## Implementation
Library: Click (Python)
Entry point: src/cli/main.py with @click.group() structure
Output: Colored console by default, JSON with --json flag

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-018")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-018")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-018")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-018")
SORT decided_at DESC
```