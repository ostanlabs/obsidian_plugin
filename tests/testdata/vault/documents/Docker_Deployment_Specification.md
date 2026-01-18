---
id: DOC-056
type: document
title: Docker Deployment Specification
workstream: engineering
status: Draft
created_at: "2026-01-15T03:11:51.993Z"
updated_at: "2026-01-15T03:17:29.975Z"
doc_type: spec
implemented_by: [S-056]
previous_version: []
updated: 2026-01-17T07:16:05.763Z
---

Docker containerization for AEL and native-tools, enabling portable deployment across development, staging, and production environments.

## Overview

Two Docker images:
1. **ael** - Main AEL runtime (MCP server, workflow engine, CLI)
2. **native-tools** - Native tools MCP server (filesystem, network, kafka, etc.)

## Image Specifications

### AEL Image

**Dockerfile**: `Dockerfile`
**Base**: `python:3.11-slim`
**Size Target**: <500MB

```dockerfile
FROM python:3.11-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev

FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY src/ ./src/
COPY config/ ./config/
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8082
ENTRYPOINT ["ael"]
CMD ["serve", "--transport", "http"]
```

**Exposed Ports**:
- 8082: MCP HTTP transport

**Volumes**:
- `/app/workflows`: Workflow definitions
- `/app/config`: Configuration files
- `/app/data`: Persistent data (telemetry, logs)

### Native Tools Image

**Dockerfile**: `docker/native-tools/Dockerfile`
**Base**: `python:3.11-slim`
**Size Target**: <400MB

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY agent/src/native_tools/ ./native_tools/
COPY agent/pyproject.toml ./
RUN pip install uv && uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
CMD ["python", "-m", "native_tools.server"]
```

**Environment Variables**:
- `FIRECRAWL_API_KEY`: Firecrawl API key
- `KAFKA_BOOTSTRAP_SERVERS`: Kafka broker addresses
- `OLLAMA_HOST`: Ollama server URL

## Docker Compose

### Production (`docker-compose.yaml`)

```yaml
version: '3.8'

services:
  ael:
    build: .
    image: ael:latest
    ports:
      - "8082:8082"
    volumes:
      - ./workflows:/app/workflows:ro
      - ./config/ael-config.yaml:/app/config/ael-config.yaml:ro
      - ael-data:/app/data
    environment:
      - AEL_LOG_LEVEL=INFO
    depends_on:
      - native-tools
    restart: unless-stopped

  native-tools:
    build:
      context: .
      dockerfile: docker/native-tools/Dockerfile
    image: native-tools:latest
    environment:
      - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
      - KAFKA_BOOTSTRAP_SERVERS=${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}
    restart: unless-stopped

volumes:
  ael-data:
```

### Development (`docker-compose.dev.yaml`)

```yaml
version: '3.8'

services:
  ael:
    build:
      context: .
      target: builder
    ports:
      - "8082:8082"
    volumes:
      - ./src:/app/src:ro
      - ./workflows:/app/workflows:ro
      - ./config:/app/config:ro
    environment:
      - AEL_LOG_LEVEL=DEBUG
      - AEL_HOT_RELOAD=true
    command: ["ael", "serve", "--transport", "http", "--reload"]
    depends_on:
      - native-tools

  native-tools:
    build:
      context: .
      dockerfile: docker/native-tools/Dockerfile
    volumes:
      - ./agent/src/native_tools:/app/native_tools:ro
    environment:
      - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
      - LOG_LEVEL=DEBUG
```

**Dev Features**:
- Source code mounted for hot-reload
- Debug logging enabled
- No restart policy (fail fast)

## Network Architecture

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
     (MCP HTTP)         (Firecrawl, Kafka)
```

## Health Checks

```yaml
services:
  ael:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8082/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AEL_CONFIG_PATH` | `/app/config/ael-config.yaml` | Config file path |
| `AEL_LOG_LEVEL` | `INFO` | Log level |
| `AEL_HTTP_PORT` | `8082` | HTTP transport port |
| `AEL_HTTP_HOST` | `0.0.0.0` | Bind address (container) |

### Config File Mounting

```bash
docker run -v $(pwd)/ael-config.yaml:/app/config/ael-config.yaml ael:latest
```

## Build Commands

```bash
# Build images
docker compose build

# Build specific image
docker build -t ael:latest .
docker build -t native-tools:latest -f docker/native-tools/Dockerfile .

# Build with no cache
docker compose build --no-cache
```

## Run Commands

```bash
# Production
docker compose up -d

# Development with hot-reload
docker compose -f docker-compose.dev.yaml up

# View logs
docker compose logs -f ael

# Execute CLI command
docker compose exec ael ael workflows list
```

## Multi-Platform Builds

```bash
# Build for multiple architectures
docker buildx build --platform linux/amd64,linux/arm64 -t ael:latest .
```

## Security Considerations

1. **Non-root user**: Run as non-root inside container
2. **Read-only mounts**: Mount config/workflows as read-only
3. **No privileged mode**: Never use `--privileged`
4. **Secret management**: Use Docker secrets or env files, never hardcode

## Related Documents

- DOC-055: HTTP Transport Specification
- DOC-034: Internal Validation Specification

## 🔗 Implemented By

```dataview
TABLE title as "Entity", type as "Type", status as "Status"
FROM ""
WHERE contains(implements, "DOC-056")
SORT type ASC, title ASC
```

## 🎯 Related Decisions

```dataview
TABLE title as "Decision", status as "Status", decided_at as "Date"
FROM "decisions"
WHERE contains(affects_documents, "DOC-056")
SORT decided_at DESC
```