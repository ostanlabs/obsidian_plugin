---
id: DOC-036
type: document
title: Implementation Task Breakdown
workstream: engineering
status: Draft
created_at: "2025-12-22T13:08:05.902Z"
updated_at: "2026-01-07T13:04:18.024Z"
doc_type: spec
implemented_by: ["M-028"]
updated: 2026-01-16T20:56:24.011Z
---


Breaks down 13 AEL implementation specs into discrete, assignable development tasks. Each task is discrete (one deliverable), testable (acceptance criteria), sized (1-4 hours), and ordered (clear dependencies).

## Task Notation
- [Sn]: Setup task
- [Cn]: Core implementation task
- [In]: Integration task
- [Tn]: Testing task

## Integration Milestones
- M1 Tool Discovery: Components 0-5, verify `ael tools list`
- M2 Workflow Loading: +7, verify `ael workflows list`
- M3 Tool Execution: +6,8,9, call tool programmatically
- M4 Workflow Execution: +10, `ael run workflow.yaml`
- M5 Agent Integration: +11,12, agent calls workflow via MCP

## Components (13 total)
0. Shared Types (Layer -1)
1. Error Registry (Layer 0)
2. Logger (Layer 0)
3. Config Loader (Layer 1)
4. MCP Client Manager (Layer 2)
5. Tool Registry (Layer 3)
6. Python Exec Sandbox (Layer 4)
7. Workflow Registry (Layer 3)
8. Template Engine (Layer 4)
9. Tool Invoker (Layer 4)
10. Workflow Engine (Layer 5)
11. MCP Frontend (Layer 6)
12. CLI (Layer 6)

## Task Pattern Per Component
1. Setup: Create module structure
2. Core: Implement classes and methods
3. Integration: Connect to dependencies
4. Testing: Unit and integration tests

## Dependency Order
Layer -1 → Layer 0 → Layer 1 → Layer 2 → Layer 3 → Layer 4 → Layer 5 → Layer 6
Shared Types → Error/Logger → Config → MCP Client → Registries → Sandbox/Template/Invoker → Engine → Frontend/CLI

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-036")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-036")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-036")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-036")
SORT decided_at DESC
```