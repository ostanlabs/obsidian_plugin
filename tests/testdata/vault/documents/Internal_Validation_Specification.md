---
id: DOC-034
type: document
title: Internal Validation Specification
workstream: engineering
status: Draft
created_at: "2025-12-22T13:00:53.822Z"
updated_at: "2026-01-15T03:17:29.982Z"
doc_type: spec
implemented_by: ["S-004"]
updated: 2026-01-17T18:14:41.429Z
---

Internal configuration connecting AEL to native_tools MCP server from agent submodule, plus example workflows validating end-to-end integration.

## Purpose
Validate AEL works with real tools before external release. Agent repo is git submodule at ./agent/, native_tools server at ./agent/src/native_tools/server.py.

## Dependencies
- AEL MVP complete (all 13 components)
- Agent submodule initialized
- Optional: Kafka, Firecrawl, Ollama for full tool coverage

## Deliverables

### internal/ael-config.yaml
Connects to native_tools via stdio, configured with env vars for Firecrawl, Kafka, Ollama.

### internal/.env.example
Documents required environment variables.

### Example Workflows
1. **fetch-url.yaml**: Simple http_request workflow
2. **fetch-and-publish.yaml**: Multi-step: http_request → code transform → kafka_publish
3. **file-operations.yaml**: Filesystem tools (fs_read, fs_write, fs_list)
4. **python-exec-explicit.yaml**: Both implicit (code:) and explicit (tool: python_exec) modes

## Available Tools in native_tools
- Filesystem: fs_read, fs_write, fs_list, fs_delete
- Network: http_request, network_ping, network_dns_lookup, network_port_check
- Kafka: kafka_publish, kafka_list_topics, kafka_create_topic, kafka_consume
- Firecrawl: firecrawl_search, firecrawl_map, firecrawl_extract
- Data: data_validate, data_json_to_csv, data_csv_to_json
- Extraction: extract_text, extract_structured, extract_file_metadata
- ML: ml_embed_text, ml_text_similarity, ml_classify_text

## Testing
- `ael serve -c internal/ael-config.yaml` starts and discovers tools
- Claude Desktop integration via claude_desktop_config.json
- End-to-end workflow execution via Claude

## Acceptance Criteria
- Config connects to native_tools MCP server
- Workflows demonstrate http, kafka, filesystem, code transformation
- Both implicit and explicit python_exec modes work
- Claude Desktop can connect and execute workflows

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-034")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-034")
SORT decided_at DESC
```