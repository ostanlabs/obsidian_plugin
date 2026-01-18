---
id: DOC-063
type: document
title: "CI/CD Research: Image Build Tools for Homelab"
workstream: infra
status: Draft
created_at: "2026-01-16T07:05:51.663Z"
updated_at: "2026-01-16T07:06:08.171Z"
doc_type: spec
previous_version: []
---

Research on CI/CD tools for building Docker images in the homelab.

## Requirements

1. Build AEL and native-tools Docker images
2. Push to private registry (192.168.68.203:5000)
3. Trigger on git push
4. Support multi-arch builds (optional)
5. Run on K3s cluster
6. Low maintenance overhead

## Options Evaluated

### 1. Woodpecker CI + BuildKit

Open-source Drone fork + docker-buildx plugin

| Pros | Cons |
|------|------|
| Lightweight (~32MB RAM) | Needs privileged mode |
| Active development | Separate service to maintain |
| Nice UI | K8s backend has quirks |
| OAuth with Gitea | Different YAML syntax than GH Actions |

### 2. Gitea Actions (Recommended)

Built-in CI/CD in Gitea 1.19+, GitHub Actions compatible

| Pros | Cons |
|------|------|
| Built into Gitea (1 service) | Relatively new |
| GitHub Actions compatible | Need act_runner |
| Huge ecosystem of actions | |
| Less maintenance | |

### 3. Tekton + BuildKit

K8s-native CI/CD with CRDs

| Pros | Cons |
|------|------|
| Pure K8s, no Docker socket | Complex setup |
| Very flexible | Steep learning curve |
| CNCF project | Overkill for homelab |

### 4. Kaniko

**NOT RECOMMENDED** - Archived in June 2025. BuildKit has replaced it.

## Build Tool Comparison

| Tool | Status | Use Case |
|------|--------|----------|
| BuildKit | ✅ Active | Default for Docker, best performance |
| Buildah | ✅ Active | Daemonless, rootless, Red Hat ecosystem |
| Kaniko | ❌ Archived | Was for K8s, now superseded by BuildKit |

## Recommendation

**Primary: Gitea Actions** (if using Gitea as git server)
- Single integrated solution
- GitHub Actions ecosystem
- Less infrastructure

**Alternative: Woodpecker CI** (if preferring separation)
- Dedicated CI service
- Nice UI for build monitoring
- Good plugin ecosystem

## Registry

Homelab registry already running at `192.168.68.203:5000`

## Related

- DEC-081: CI/CD Tool Decision (Pending)

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-063")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-063")
SORT decided_at DESC
```