---
id: DOC-043
type: document
title: Future Features
workstream: product
status: Draft
created_at: "2025-12-22T13:11:14.064Z"
updated_at: "2026-01-07T13:04:18.022Z"
doc_type: spec
implemented_by: ["M-029","S-041"]
updated: 2026-01-17T18:14:41.433Z
---


Track features considered but deferred for future implementation.

## MVP Deferred Items (Immediate Priority)

### CLI Commands (Tests skipped: 14)
- `ael validate <workflow>` (2-4h)
- `ael workflows show <n>` (1-2h)
- `ael tools list` (1-2h)
- `ael tools show <n>` (1-2h)
- `ael tools refresh` (1h)
- `ael config show` (1h)
Total: ~8-12 hours

### Spec Alignment
- Align PythonExecSandbox API with spec (4-6h)
- Rename SandboxResult → CodeExecutionResult (30m)
Total: ~5-7 hours

## Deferred Feature Categories
Each entry includes: Feature, Category (OSS/Premium/Research), Deferred Because, Trigger to Revisit, Related Decisions

## Sample Deferred Features

### FF-001: YAML Anchors and Aliases
Category: Premium candidate
Support YAML anchors (&anchor) and aliases (*alias) for DRY workflows.
Deferred: Adds complexity, users can use defaults: section.
Revisit: Multiple user requests, enterprise customers with large workflows.

### FF-002: External Code File References
Category: Research
Allow code_file: ./scripts/transform.py instead of inline code blocks.
Deferred: Security implications, needs careful design.
Revisit: Users need large code blocks that don't fit inline.

### FF-003 to FF-025+
Multiple features covering: conditional execution, parallel steps, composition, REST API, HTTP transport, extended package tiers, policy engine, pattern mining, workflow synthesis, etc.

See full document for complete list with effort estimates and triggers.

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-043")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-043")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-043")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-043")
SORT decided_at DESC
```