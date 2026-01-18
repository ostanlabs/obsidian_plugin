---
id: DOC-025
type: document
title: Template Engine Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T12:39:54.972Z"
updated_at: "2026-01-07T13:04:18.045Z"
doc_type: spec
implemented_by: [M-008]
updated: 2026-01-12T03:49:11.372Z
---


Jinja2-based template rendering for workflow parameters. Provides secure, restricted templating with access to inputs, step outputs, and config.

## Dependencies
- Error Registry (template errors)
- Logger

## Template Syntax
Jinja2-style {{ }} with restrictions:
- Variable access: {{ inputs.url }}
- Nested access: {{ steps.fetch.output.content }}
- Filters: {{ value | default('fallback') }}, {{ items | length }}, {{ data | json }}
- No arbitrary expressions (security)

## Template Context
- inputs: Workflow input values
- steps: Previous step outputs (steps.step_id.output)
- config: Workflow configuration
- execution_id: Current execution ID

## TemplateEngine Class
- render(template, context) → str: Render template with context
- render_params(params, context) → Dict: Render all params in dict
- validate(template) → List[str]: Validate template syntax, return errors

## Security Restrictions
- No function calls except allowed filters
- No import statements
- No attribute access to private members (__*)
- Sandboxed Jinja2 environment

## Error Handling
- Undefined variables: TEMPLATE_ERROR with variable name
- Invalid syntax: TEMPLATE_ERROR with parse error
- Filter errors: TEMPLATE_ERROR with filter name

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-025")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-025")
SORT decided_at DESC
```

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-025")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-025")
SORT decided_at DESC
```