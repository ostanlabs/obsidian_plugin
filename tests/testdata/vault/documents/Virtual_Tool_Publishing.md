---
id: DOC-016
type: document
title: Virtual Tool Publishing
workstream: engineering
status: Draft
created_at: "2025-12-22T12:30:05.078Z"
updated_at: "2026-01-07T13:04:18.050Z"
doc_type: spec
implemented_by: ["M-028"]
updated: 2026-01-17T18:14:41.420Z
---


Virtual Tool Publishing enables workflows to be exposed as MCP tools that agents can call. This is the core "workflow-as-tool" capability that reduces agent token usage and increases execution reliability.

## Value Proposition
BEFORE: Agent orchestrates multiple tools (3 calls, 3 LLM round-trips, handles intermediate state)
AFTER: Agent calls workflow:scrape-and-publish (1 call, 1 LLM round-trip, deterministic execution)

## Tool Generation
Workflow YAML automatically generates MCP tool definition with name (workflow: prefix), description, inputSchema from workflow inputs.

## Naming Convention
Required prefix: workflow: (e.g., workflow:scrape-and-publish)
Why: Disambiguation from native tools, easy grouping, no collision with native tool names.

## Parameter Mapping
Workflow inputs → MCP inputSchema (supports lightweight and full JSON Schema syntax)
Workflow outputs → MCP response content (JSON serialized as text)

## Error Handling
Workflow failures return isError: true with structured error in _meta (code, category, message, step_id, retryable)
Premium: Partial results on failure

## Workflow Composition (Premium Only)
Workflows can call other workflows as steps. OSS validates and blocks workflow: references.
Recursion prevention: max_workflow_depth config, circular dependency detection

## Versioning
OSS: Always resolves to latest version
Premium: Version pinning (@1.2.0, @1, @^1.0)
Execution snapshot: Workflow definition captured at execution start

## OSS vs Premium
OSS: Define workflows, publish as MCP tools, input/output schema, latest version only
Premium: + Workflow composition, version pinning, per-workflow exposure control, partial results

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-016")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-016")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-016")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-016")
SORT decided_at DESC
```