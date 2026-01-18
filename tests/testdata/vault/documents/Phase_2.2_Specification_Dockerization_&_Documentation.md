---
id: DOC-057
type: document
title: "Phase 2.2 Specification: Dockerization & Documentation"
workstream: engineering
status: Draft
created_at: "2026-01-15T03:44:06.293Z"
updated_at: "2026-01-15T03:44:51.067Z"
doc_type: spec
implemented_by: [M-039]
previous_version: []
updated: 2026-01-17T07:16:05.763Z
---

Comprehensive specification for M-039: Dockerization and user documentation for AEL OSS release.

## Overview

This phase delivers:
1. Docker images for portable AEL deployment
2. Native tools validation and documentation
3. Essential user documentation for adoption
4. User story framework for feature validation

## Milestone: M-039

**Total Effort**: ~3 weeks
**Stories**: 4
**Tasks**: 22

---

## Story 1: AEL Dockerization (S-056)

**Spec**: DOC-056 (Docker Deployment Specification)
**Effort**: ~1 week

### Deliverables

| File | Purpose |
|------|--------|
| `Dockerfile` | Multi-stage AEL image (<500MB) |
| `docker/native-tools/Dockerfile` | Native tools image (<400MB) |
| `docker-compose.yaml` | Production deployment |
| `docker-compose.dev.yaml` | Development with hot-reload |
| `docs/DOCKER.md` | Usage documentation |

### Image Architecture

```
┌─────────────────────────────────────────┐
│           Docker Network                │
│                                         │
│  ┌─────────────┐    ┌──────────────┐   │
│  │     ael     │───▶│ native-tools │   │
│  │   :8082     │    │   (stdio)    │   │
│  └─────────────┘    └──────────────┘   │
│         │                   │          │
└─────────┼───────────────────┼──────────┘
          │                   │
          ▼                   ▼
     Host :8082         External APIs
```

### Tasks

| ID | Task | Effort | Priority |
|----|------|--------|----------|
| T-094 | Create AEL Dockerfile | M | High |
| T-095 | Create native-tools Dockerfile | S | High |
| T-096 | Create docker-compose.yaml | S | High |
| T-097 | Create docker-compose.dev.yaml | S | Medium |
| T-098 | Document Docker usage | S | Medium |

### Acceptance Criteria

- [ ] `docker compose up` starts AEL and native-tools
- [ ] AEL accessible on port 8082
- [ ] Hot-reload works in dev mode
- [ ] Health checks pass
- [ ] Images <500MB (AEL), <400MB (native-tools)
- [ ] Works on amd64 and arm64

---

## Story 2: Native Tools Server (S-071)

**Spec**: DOC-034 (Internal Validation Specification)
**Effort**: ~3-4 days

### Available Tools

| Category | Tools | Requires |
|----------|-------|----------|
| Filesystem | fs_read, fs_write, fs_list, fs_delete | - |
| Network | http_request, network_ping, network_dns_lookup | - |
| Kafka | kafka_publish, kafka_list_topics, kafka_consume | Kafka broker |
| Firecrawl | firecrawl_search, firecrawl_map, firecrawl_extract | API key |
| Data | data_validate, data_json_to_csv, data_csv_to_json | - |
| Extraction | extract_text, extract_structured | - |
| ML | ml_embed_text, ml_text_similarity | Ollama |

### Tasks

| ID | Task | Effort | Priority |
|----|------|--------|----------|
| T-174 | Verify native tools discovery via AEL | S | High |
| T-175 | Test filesystem tools | S | Medium |
| T-176 | Test network tools | S | Medium |
| T-177 | Test Kafka tools | M | Medium |
| T-178 | Create example workflows for each tool category | M | High |
| T-179 | Document native tools schemas and usage | M | Medium |

### Acceptance Criteria

- [ ] All tool categories discoverable via `ael tools list`
- [ ] Each tool invocable via workflow
- [ ] Tool schemas documented
- [ ] Example workflow per category
- [ ] Error handling works correctly

---

## Story 3: User Documentation P1 (S-057)

**Effort**: ~1 week

### Documentation Structure

| Document | Purpose | Length |
|----------|---------|--------|
| QUICKSTART.md | 5-minute getting started | 1 page |
| INSTALLATION.md | All installation methods | 2 pages |
| CONFIG_REFERENCE.md | Full config documentation | 3 pages |
| YAML_SCHEMA.md | Workflow syntax reference | 3 pages |
| CLAUDE_DESKTOP.md | Integration guide | 1 page |
| examples/ | Working example workflows | N/A |

### QUICKSTART.md Structure

```markdown
# AEL Quickstart

## Install
pip install ael

## Create workflow
# hello-world.yaml
name: hello-world
steps:
  - tool: http_request
    params:
      url: https://httpbin.org/get

## Run
ael run hello-world.yaml

## Next steps
- [Examples](examples/)
- [Full documentation](docs/)
- [Claude Desktop setup](CLAUDE_DESKTOP.md)
```

### Tasks

| ID | Task | Effort | Priority |
|----|------|--------|----------|
| T-099 | Write QUICKSTART.md | S | High |
| T-100 | Write INSTALLATION.md | S | High |
| T-101 | Write CONFIG_REFERENCE.md | M | High |
| T-102 | Write YAML_SCHEMA.md | M | High |
| T-103 | Write CLAUDE_DESKTOP.md | S | High |
| T-104 | Create example workflows | M | Medium |

### Acceptance Criteria

- [ ] New user can start AEL in <5 minutes with QUICKSTART
- [ ] All config options documented
- [ ] Workflow syntax fully documented with examples
- [ ] Claude Desktop integration tested and documented
- [ ] 3+ working example workflows

---

## Story 4: User Stories Framework (S-058)

**Effort**: ~3-4 days

### User Personas

| Persona | Role | Focus | AEL Tier |
|---------|------|-------|----------|
| Alex (OSS Dev) | Individual contributor | Learning, personal automation | OSS |
| Jordan (Team Lead) | Engineering manager | Standardization, CI/CD | OSS+ |
| Morgan (Enterprise Architect) | Platform architect | Governance, security | Premium |

### Story Extraction Sources

- DOC-018: CLI Specification
- DOC-046: D1 OSS Developer Demo
- DOC-047: D2 Investor Demo
- DOC-048: D3 Enterprise Leader Demo

### Tasks

| ID | Task | Effort | Priority |
|----|------|--------|----------|
| T-105 | Define user personas | S | Medium |
| T-106 | Extract stories from CLI guide | S | Medium |
| T-107 | Extract stories from demo specs | S | Medium |
| T-108 | Create story→test mapping | M | Medium |
| T-109 | Identify test coverage gaps | S | Medium |

### Acceptance Criteria

- [ ] 3 personas documented with goals and pain points
- [ ] 20+ user stories extracted
- [ ] Stories mapped to existing tests
- [ ] Gap analysis shows untested scenarios
- [ ] Framework usable for future feature validation

---

## Dependencies

### Blocked By

- M-023: Phase 2.1 HTTP Transport (S-056 depends on HTTP transport for Docker)

### Blocks

- M-024: Phase 3.3 Plugin Framework
- M-001: Phase 2.3 Homelab Deployment
- M-028: Phase 3.2 User Documentation (P2)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker image size bloat | Medium | Multi-stage builds, .dockerignore |
| Native tools env dependencies | Low | Document optional tools clearly |
| Documentation drift | Medium | Link docs to tests, review process |

---

## Success Metrics

1. **Docker**: `docker compose up` works on fresh machine in <2 minutes
2. **Native Tools**: All tools discoverable and invocable
3. **Documentation**: New user completes QUICKSTART in <5 minutes
4. **User Stories**: >80% of P0 stories have test coverage

---

## Related Documents

- DOC-056: Docker Deployment Specification
- DOC-034: Internal Validation Specification
- DOC-055: HTTP Transport Specification (dependency)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-057")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-057")
SORT decided_at DESC
```