---
id: DOC-059
type: document
title: "Phase 2.3 Specification: Homelab Deployment"
workstream: infra
status: Draft
created_at: "2026-01-15T03:55:57.730Z"
updated_at: "2026-01-15T03:57:06.870Z"
doc_type: spec
implemented_by: [M-001]
previous_version: []
updated: 2026-01-17T07:16:05.770Z
---

Comprehensive specification for M-001: Deploy AEL and dependencies to homelab infrastructure.

## Overview

This phase deploys AEL to a physical homelab server for:
1. Internal dogfooding and validation
2. Performance baseline establishment
3. Integration testing with real infrastructure
4. Demo environment preparation

## Milestone: M-001

**Total Effort**: ~2 weeks
**Stories**: 4 (core) + 4 (infrastructure - deferred)
**Tasks**: 28

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    Homelab Server                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                    Docker Compose                        │   │
│  │                                                         │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌─────────────┐        │   │
│  │  │   AEL   │  │ native-tools │  │  Firecrawl  │        │   │
│  │  │  :8082  │  │   (stdio)    │  │    :3002   │        │   │
│  │  └─────────┘  └─────────────┘  └─────────────┘        │   │
│  │                                                         │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌─────────────┐        │   │
│  │  │  Kafka  │  │  Zookeeper   │  │ Prometheus  │        │   │
│  │  │ :29092 │  │    :2181    │  │   :9090    │        │   │
│  │  └─────────┘  └─────────────┘  └─────────────┘        │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## Story 1: Homelab Machine Readiness (S-077)

**Effort**: ~2-3 days
**Tasks**: 6

### Prerequisites

- Physical server with Ubuntu 22.04+
- Static IP on local network
- SSH access configured
- Sufficient resources (see below)

### Resource Requirements

| Component | CPU | RAM | Disk |
|-----------|-----|-----|------|
| AEL | 1 core | 1 GB | 1 GB |
| Native Tools | 0.5 core | 512 MB | 500 MB |
| Kafka + Zookeeper | 2 cores | 4 GB | 10 GB |
| Firecrawl | 2 cores | 2 GB | 5 GB |
| Prometheus | 0.5 core | 1 GB | 10 GB |
| **Total** | **6 cores** | **8.5 GB** | **26.5 GB** |

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T-123 | Document homelab hardware inventory | S |
| T-124 | Define AEL stack resource requirements | S |
| T-125 | Verify CPU/RAM/Storage capacity | S |
| T-126 | Verify network configuration | S |
| T-127 | Install and configure Docker | M |
| T-128 | Run baseline performance tests | M |

---

## Story 2: AEL Homelab Deployment (S-078)

**Effort**: ~3-4 days
**Tasks**: 6

### Deployment Process

1. Build Docker images locally or in CI
2. Push to homelab registry (or Docker Hub)
3. Create homelab-specific compose file
4. Configure secrets (API keys, etc.)
5. Deploy stack
6. Verify operation

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T-129 | Push AEL Docker images to registry | S |
| T-130 | Create docker-compose.homelab.yaml | M |
| T-131 | Configure secrets management | M |
| T-132 | Deploy AEL stack to homelab | S |
| T-133 | Verify AEL is operational | M |
| T-134 | Run smoke tests | M |

---

## Story 3: Firecrawl and Kafka Dependencies (S-079)

**Effort**: ~3-4 days
**Tasks**: 8

### Kafka Setup

```yaml
kafka:
  image: confluentinc/cp-kafka:latest
  environment:
    KAFKA_BROKER_ID: 1
    KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092
  depends_on:
    - zookeeper

zookeeper:
  image: confluentinc/cp-zookeeper:latest
  environment:
    ZOOKEEPER_CLIENT_PORT: 2181
```

### Firecrawl Setup

```yaml
firecrawl:
  image: firecrawl:latest
  ports:
    - "3002:3002"
  environment:
    - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
```

### Tasks

| ID | Task | Effort |
|----|------|--------|
| T-135 | Deploy Kafka cluster | M |
| T-136 | Configure Kafka topics and retention | S |
| T-137 | Verify Kafka connectivity from AEL | S |
| T-138 | Deploy Firecrawl service | M |
| T-139 | Configure Firecrawl API keys | S |
| T-140 | Verify Firecrawl connectivity from AEL | S |
| T-141 | Deploy Prometheus for metrics | S |
| T-142 | Configure Docker network | S |

---

## Story 4: K3s Migration (S-083) - DEFERRED

**Status**: Deferred to future phase
**Reason**: Docker Compose sufficient for MVP, K8s adds complexity

Will be addressed after initial deployment is stable.

---

## Deferred Stories

The following stories are generic infrastructure and deferred:

| Story | Title | Status |
|-------|-------|--------|
| S-005 | Internal Artifactory | Deferred |
| S-006 | Backups configured | Deferred |
| S-007 | K8s hosting ready | Deferred |
| S-008 | Build system ready | Deferred |

---

## Dependencies

### Blocked By

- M-039: Phase 2.2 Dockerization (Docker images required)

### Blocks

- M-026: Phase 3.1 Integration Testing
- M-031: D1 OSS Developer Demo

---

## Verification Checklist

- [ ] AEL accessible at homelab:8082
- [ ] `ael tools list` returns all tools
- [ ] Workflow execution succeeds
- [ ] Kafka publish/consume works
- [ ] Firecrawl scraping works
- [ ] Prometheus scraping metrics
- [ ] Logs accessible

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hardware failure | High | Regular backups, spare parts |
| Network issues | Medium | Static IP, monitoring |
| Resource exhaustion | Medium | Monitor usage, set limits |

---

## Related Documents

- DOC-056: Docker Deployment Specification
- DOC-057: Phase 2.2 Specification
- DOC-058: Phase 2.4 Observability Specification

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-059")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-059")
SORT decided_at DESC
```