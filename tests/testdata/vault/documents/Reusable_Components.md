---
id: DOC-008
type: document
title: Reusable Components
workstream: engineering
status: Draft
created_at: "2025-12-22T07:11:04.144Z"
updated_at: "2026-01-07T13:04:18.042Z"
doc_type: spec
implemented_by: ["M-028","M-019"]
updated: 2026-01-17T18:14:40.392Z
---


Several components from the existing AI Agent Framework can be directly reused or adapted for AEL.

## Components to Reuse Directly
- CodeExecutionSandbox: Core security for Python Exec
- AllowlistMCPClientManager: Tool whitelist enforcement
- StepTrace/StageTrace: Telemetry data structures
- ToolsLogger: Hierarchical colored logging
- colored_metrics: Execution summary display

## Components to Adapt
- ExecutionHistory: Adapt for workflow registry, remove agent-specific fields
- ToolSelector: Keep embedding logic, remove agent planning integration
- ToolLearner: Foundation for Tool Profiler (Premium)
- LearningStore: Foundation for Pattern storage
- MCPClientManager: Add HTTP transport (currently stdio only)
- Native Tools Server: Add HTTP transport mode

## Components NOT to Reuse (Agent-Specific)
Planner, DAGManager, StageExecutionEngine, ReflectionEngine, StagePlanner, Memory Subsystem - all tightly coupled to agent's LLM-driven decision making

## New Components Needed
High Priority: Workflow Engine, Workflow Registry, Tool Registry, MCP Protocol Frontend, REST API, CLI
Medium Priority: Plugin Manager, Virtual Tool Publisher
Lower Priority (Premium): Pattern Miner, Workflow Synthesizer, Policy Engine

## Security Layer Preservation
7-layer sandbox model preserved: Import Restrictions, Builtin Restrictions, Tool Whitelist, Rate Limiting, Parameter Validation, Timeout Enforcement, Recursive Prevention

## Migration Path
Phase 1: Extract core components (sandbox, traces, logging)
Phase 2: Adapt shared components (MCP transport, tool selector, history)
Phase 3: Build new components (workflow engine, registries, API, CLI, MCP frontend)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-008")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-008")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-008")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-008")
SORT decided_at DESC
```