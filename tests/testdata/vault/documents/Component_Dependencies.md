---
id: DOC-041
type: document
title: Component Dependencies
workstream: engineering
status: Draft
created_at: "2025-12-22T13:10:04.363Z"
updated_at: "2026-01-07T13:04:18.011Z"
doc_type: spec
implemented_by: ["M-028"]
updated: 2026-01-16T20:56:24.020Z
---


Component dependency graph for AEL MVP. Status: COMPLETE - All components built in order.

## Build Order (As Executed)

| Layer | Component | Status |
|-------|-----------|--------|
| 0 | Shared Types | ✅ |
| 0 | Logger | ✅ |
| 1 | Error Registry | ✅ |
| 1 | Config Loader | ✅ |
| 2 | MCP Client Manager | ✅ |
| 3 | Tool Registry | ✅ |
| 3 | Workflow Registry | ✅ |
| 4 | Template Engine | ✅ |
| 4 | Python Exec Sandbox | ✅ |
| 4 | Tool Invoker | ✅ |
| 5 | Workflow Engine | ✅ |
| 6 | MCP Frontend | ✅ |
| 6 | CLI | ✅ |

## Dependency Flow (Top to Bottom)
CLI → Workflow Engine, MCP Frontend, Config Loader
Workflow Engine → Tool Invoker, Template Engine, Workflow Registry
Tool Invoker → Python Exec Sandbox, Tool Registry
Workflow Registry → Tool Registry
Tool Registry → MCP Client Manager
MCP Client Manager → Config Loader, Error Registry, Logger

## Milestones (All Complete)
- M1 Tool Discovery: Components 0-5, `ael tools list` ✅
- M2 Workflow Loading: +7, `ael workflows list` ✅
- M3 Tool Execution: +6,8,9, Internal tool call ✅
- M4 Workflow Execution: +10, `ael run workflow.yaml` ✅
- M5 Agent Integration: +11,12, MCP `workflow:x` call ✅

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-041")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-041")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-041")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-041")
SORT decided_at DESC
```